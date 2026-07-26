# One-time installer for Katherine's normal-chat Blender bridge.
# Installs under LocalAppData, starts now, and starts silently at Windows login.

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$repo = 'amuletmaiden/kt-bus'
$bridgeApiPath = 'repos/amuletmaiden/kt-bus/contents/blender-bridge/bridge.py'
$installDir = Join-Path $env:LOCALAPPDATA 'KatherineBlenderBridge'
$bridgePath = Join-Path $installDir 'bridge.py'
$launcherPath = Join-Path $installDir 'launch.ps1'
$logPath = Join-Path $installDir 'bridge.log'
$startupDir = [Environment]::GetFolderPath('Startup')
$startupPath = Join-Path $startupDir 'Katherine Blender Bridge.vbs'

function Require-Command {
    param([string]$Name, [string]$Help)
    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "$Name is required. $Help"
    }
}

function Invoke-CapturedProcess {
    param(
        [Parameter(Mandatory = $true)][string]$FilePath,
        [Parameter(Mandatory = $true)][string[]]$Arguments
    )

    $stdoutPath = [IO.Path]::GetTempFileName()
    $stderrPath = [IO.Path]::GetTempFileName()
    try {
        $process = Start-Process -FilePath $FilePath `
            -ArgumentList $Arguments `
            -Wait -PassThru -NoNewWindow `
            -RedirectStandardOutput $stdoutPath `
            -RedirectStandardError $stderrPath

        return [pscustomobject]@{
            ExitCode = $process.ExitCode
            StdOut = [IO.File]::ReadAllText($stdoutPath)
            StdErr = [IO.File]::ReadAllText($stderrPath)
        }
    } finally {
        Remove-Item -LiteralPath $stdoutPath, $stderrPath -Force -ErrorAction SilentlyContinue
    }
}

function Escape-SingleQuotedPowerShellString {
    param([string]$Value)
    return $Value.Replace("'", "''")
}

function ConvertTo-PowerShellArrayLiteral {
    param([string[]]$Values)
    if (-not $Values -or $Values.Count -eq 0) {
        return '@()'
    }

    $quoted = foreach ($value in $Values) {
        "'$(Escape-SingleQuotedPowerShellString $value)'"
    }
    return '@(' + ($quoted -join ', ') + ')'
}

Write-Host ''
Write-Host 'Installing the Katherine Blender chat bridge...' -ForegroundColor Cyan

Require-Command 'gh' 'Install GitHub CLI, then run this command again.'

$ghExe = (Get-Command 'gh').Source
$auth = Invoke-CapturedProcess -FilePath $ghExe -Arguments @(
    'auth', 'status', '--hostname', 'github.com'
)

if ($auth.ExitCode -ne 0) {
    Write-Host 'GitHub needs one-time authorization. A browser window will open.' -ForegroundColor Yellow
    Write-Host 'Approve the amuletmaiden account, then return to this window.' -ForegroundColor Yellow

    $login = Start-Process -FilePath $ghExe -ArgumentList @(
        'auth', 'login',
        '--hostname', 'github.com',
        '--git-protocol', 'https',
        '--web'
    ) -Wait -PassThru -NoNewWindow

    if ($login.ExitCode -ne 0) {
        throw 'GitHub authorization did not complete.'
    }
}

$auth = Invoke-CapturedProcess -FilePath $ghExe -Arguments @(
    'auth', 'status', '--hostname', 'github.com'
)
if ($auth.ExitCode -ne 0) {
    throw "GitHub authorization did not complete.`n$($auth.StdErr.Trim())"
}

# Make HTTPS git operations use the same durable GitHub CLI credential.
$setupGit = Invoke-CapturedProcess -FilePath $ghExe -Arguments @('auth', 'setup-git')
if ($setupGit.ExitCode -ne 0) {
    Write-Host 'Warning: Git credential helper setup failed, but the bridge can still run.' -ForegroundColor Yellow
}

# Use the Windows Python launcher when available. Do not use `py -c` here:
# Start-Process quoting can split the Python code string on older PowerShell versions.
if (Get-Command 'py' -ErrorAction SilentlyContinue) {
    $pythonExe = (Get-Command 'py').Source
    $pythonArgs = @('-3')
    $pythonCheck = Invoke-CapturedProcess -FilePath $pythonExe -Arguments @('-3', '--version')
} elseif (Get-Command 'python' -ErrorAction SilentlyContinue) {
    $pythonExe = (Get-Command 'python').Source
    $pythonArgs = @()
    $pythonCheck = Invoke-CapturedProcess -FilePath $pythonExe -Arguments @('--version')
} else {
    throw 'Python 3 is required. Install Python 3, then run this installer again.'
}

if ($pythonCheck.ExitCode -ne 0) {
    throw "Could not start Python 3.`n$($pythonCheck.StdErr.Trim())"
}

New-Item -ItemType Directory -Path $installDir -Force | Out-Null

$download = Invoke-CapturedProcess -FilePath $ghExe -Arguments @(
    'api', $bridgeApiPath, '--jq', '.content'
)
if ($download.ExitCode -ne 0 -or -not $download.StdOut.Trim()) {
    throw "Could not retrieve the bridge from the private repository $repo.`n$($download.StdErr.Trim())"
}

$bytes = [Convert]::FromBase64String(($download.StdOut -replace '\s', ''))
[IO.File]::WriteAllBytes($bridgePath, $bytes)

$installEsc = Escape-SingleQuotedPowerShellString $installDir
$bridgeEsc = Escape-SingleQuotedPowerShellString $bridgePath
$pythonEsc = Escape-SingleQuotedPowerShellString $pythonExe
$pythonArgsLiteral = ConvertTo-PowerShellArrayLiteral $pythonArgs
$logEsc = Escape-SingleQuotedPowerShellString $logPath
$apiEsc = Escape-SingleQuotedPowerShellString $bridgeApiPath
$ghEsc = Escape-SingleQuotedPowerShellString $ghExe

$launcher = @"
`$ErrorActionPreference = 'Continue'
`$installDir = '$installEsc'
`$bridgePath = '$bridgeEsc'
`$pythonExe = '$pythonEsc'
`$pythonArgs = $pythonArgsLiteral
`$logPath = '$logEsc'
`$bridgeApiPath = '$apiEsc'
`$ghExe = '$ghEsc'

New-Item -ItemType Directory -Path `$installDir -Force | Out-Null
`$mutex = New-Object System.Threading.Mutex(`$false, 'Local\KatherineBlenderChatBridge')
if (-not `$mutex.WaitOne(0, `$false)) { exit 0 }

try {
    while (`$true) {
        # Refresh the bridge from the private repository whenever possible.
        `$encoded = & `$ghExe api `$bridgeApiPath --jq '.content' 2>> `$logPath
        if (`$LASTEXITCODE -eq 0 -and `$encoded) {
            try {
                `$bytes = [Convert]::FromBase64String(((`$encoded -join '') -replace '\s', ''))
                [IO.File]::WriteAllBytes(`$bridgePath, `$bytes)
            } catch {
                "[`$(Get-Date -Format s)] Bridge update failed: `$_" | Add-Content `$logPath
            }
        }

        "[`$(Get-Date -Format s)] Starting bridge" | Add-Content `$logPath
        & `$pythonExe @pythonArgs `$bridgePath *>> `$logPath
        "[`$(Get-Date -Format s)] Bridge stopped with exit code `$LASTEXITCODE; restarting in 10 seconds" | Add-Content `$logPath
        Start-Sleep -Seconds 10
    }
} finally {
    try { `$mutex.ReleaseMutex() } catch {}
    `$mutex.Dispose()
}
"@
Set-Content -LiteralPath $launcherPath -Value $launcher -Encoding UTF8

$escapedLauncherForVbs = $launcherPath.Replace('"', '""')
$vbs = 'CreateObject("Wscript.Shell").Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -File ""' + $escapedLauncherForVbs + '""", 0, False'
Set-Content -LiteralPath $startupPath -Value $vbs -Encoding ASCII

# Stop an older bridge instance so this installation starts the newest launcher.
$bridgeRegex = [Regex]::Escape($bridgePath)
Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -and $_.CommandLine -match $bridgeRegex } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }

# Start immediately. The Startup entry handles future Windows logins.
Start-Process powershell.exe -WindowStyle Hidden -ArgumentList @(
    '-NoProfile',
    '-ExecutionPolicy', 'Bypass',
    '-File', $launcherPath
)
Start-Sleep -Seconds 3

$running = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -and $_.CommandLine -match $bridgeRegex }

Write-Host ''
if ($running) {
    Write-Host 'Installed, authenticated, and running.' -ForegroundColor Green
} else {
    Write-Host 'Installed, but the process was not detected yet.' -ForegroundColor Yellow
    Write-Host "Check the log: $logPath"
}
Write-Host "Autostart entry: $startupPath"
Write-Host "Bridge log:      $logPath"
Write-Host ''
Write-Host 'Keep Blender open with Blender MCP running on port 9876.' -ForegroundColor Cyan
Write-Host 'In a fresh chat, say: Use my kt-bus Blender bridge and work on the open scene.' -ForegroundColor Cyan
