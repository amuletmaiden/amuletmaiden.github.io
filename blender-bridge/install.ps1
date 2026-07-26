# One-time installer for Katherine's normal-chat Blender bridge.
# It installs the bridge under LocalAppData, starts it now, and starts it at login.

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

function Test-GitHubAuthentication {
    # Run through cmd.exe so gh's expected "not logged in" stderr output does
    # not become a terminating NativeCommandError under Windows PowerShell.
    & cmd.exe /d /c 'gh auth status --hostname github.com >nul 2>nul'
    return ($LASTEXITCODE -eq 0)
}

Write-Host ''
Write-Host 'Installing the Katherine Blender chat bridge...' -ForegroundColor Cyan

Require-Command 'gh' 'Install GitHub CLI, then run this command again.'
if (-not (Get-Command 'py' -ErrorAction SilentlyContinue) -and
    -not (Get-Command 'python' -ErrorAction SilentlyContinue)) {
    throw 'Python is required. Install Python 3, then run this command again.'
}

if (-not (Test-GitHubAuthentication)) {
    Write-Host 'GitHub needs one-time authorization. A browser window will open.' -ForegroundColor Yellow
    & gh auth login --hostname github.com --git-protocol https --web
    if ($LASTEXITCODE -ne 0) {
        throw 'GitHub authorization was cancelled or failed.'
    }
}

if (-not (Test-GitHubAuthentication)) {
    throw 'GitHub authorization did not complete.'
}

New-Item -ItemType Directory -Path $installDir -Force | Out-Null

$encoded = & gh api $bridgeApiPath --jq '.content'
if ($LASTEXITCODE -ne 0 -or -not $encoded) {
    throw "Could not retrieve the bridge from the private repository $repo."
}
$bytes = [Convert]::FromBase64String((($encoded -join '') -replace '\s', ''))
[IO.File]::WriteAllBytes($bridgePath, $bytes)

if (Get-Command 'py' -ErrorAction SilentlyContinue) {
    $pythonExe = (& py -3 -c 'import sys; print(sys.executable)').Trim()
} else {
    $pythonExe = (Get-Command 'python').Source
}
if (-not $pythonExe) {
    throw 'Could not locate the Python executable.'
}

function Escape-SingleQuotedPowerShellString {
    param([string]$Value)
    return $Value.Replace("'", "''")
}

$installEsc = Escape-SingleQuotedPowerShellString $installDir
$bridgeEsc = Escape-SingleQuotedPowerShellString $bridgePath
$pythonEsc = Escape-SingleQuotedPowerShellString $pythonExe
$logEsc = Escape-SingleQuotedPowerShellString $logPath
$apiEsc = Escape-SingleQuotedPowerShellString $bridgeApiPath

$launcher = @"
`$ErrorActionPreference = 'Continue'
`$installDir = '$installEsc'
`$bridgePath = '$bridgeEsc'
`$pythonExe = '$pythonEsc'
`$logPath = '$logEsc'
`$bridgeApiPath = '$apiEsc'

New-Item -ItemType Directory -Path `$installDir -Force | Out-Null
`$mutex = New-Object System.Threading.Mutex(`$false, 'Local\KatherineBlenderChatBridge')
if (-not `$mutex.WaitOne(0, `$false)) { exit 0 }

try {
    # Refresh the bridge from the private repository when possible.
    `$encoded = & gh api `$bridgeApiPath --jq '.content' 2>> `$logPath
    if (`$LASTEXITCODE -eq 0 -and `$encoded) {
        try {
            `$bytes = [Convert]::FromBase64String(((`$encoded -join '') -replace '\s', ''))
            [IO.File]::WriteAllBytes(`$bridgePath, `$bytes)
        } catch {
            "[`$(Get-Date -Format s)] Bridge update failed: `$_" | Add-Content `$logPath
        }
    }

    "[`$(Get-Date -Format s)] Starting bridge" | Add-Content `$logPath
    & `$pythonExe `$bridgePath *>> `$logPath
    "[`$(Get-Date -Format s)] Bridge stopped with exit code `$LASTEXITCODE" | Add-Content `$logPath
} finally {
    try { `$mutex.ReleaseMutex() } catch {}
    `$mutex.Dispose()
}
"@
Set-Content -LiteralPath $launcherPath -Value $launcher -Encoding UTF8

$escapedLauncherForVbs = $launcherPath.Replace('"', '""')
$vbs = 'CreateObject("Wscript.Shell").Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -File ""' + $escapedLauncherForVbs + '""", 0, False'
Set-Content -LiteralPath $startupPath -Value $vbs -Encoding ASCII

# Start it immediately. The Startup entry handles future Windows logins.
Start-Process powershell.exe -WindowStyle Hidden -ArgumentList @(
    '-NoProfile',
    '-ExecutionPolicy', 'Bypass',
    '-File', $launcherPath
)
Start-Sleep -Seconds 2

$bridgeRegex = [Regex]::Escape($bridgePath)
$running = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -and $_.CommandLine -match $bridgeRegex }

Write-Host ''
if ($running) {
    Write-Host 'Installed and running.' -ForegroundColor Green
} else {
    Write-Host 'Installed, but the process was not detected yet.' -ForegroundColor Yellow
    Write-Host "Check the log: $logPath"
}
Write-Host "Autostart entry: $startupPath"
Write-Host "Bridge log:      $logPath"
Write-Host ''
Write-Host 'Keep Blender open with Blender MCP running on port 9876.' -ForegroundColor Cyan
Write-Host 'In a fresh chat, say: Use my kt-bus Blender bridge and work on the open scene.' -ForegroundColor Cyan
