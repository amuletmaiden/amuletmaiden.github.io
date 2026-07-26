# Durable repair for Katherine's normal-chat Blender bridge.
# Reinstalls the local supervisor, registers user-level scheduled tasks,
# starts the bridge immediately, and restarts it when queued commands stall.

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$repo = 'amuletmaiden/kt-bus'
$bridgeApiPath = 'repos/amuletmaiden/kt-bus/contents/blender-bridge/bridge.py'
$installDir = Join-Path $env:LOCALAPPDATA 'KatherineBlenderBridge'
$bridgePath = Join-Path $installDir 'bridge.py'
$launcherPath = Join-Path $installDir 'launch.ps1'
$watchdogPath = Join-Path $installDir 'watchdog.ps1'
$logPath = Join-Path $installDir 'bridge.log'
$watchdogLogPath = Join-Path $installDir 'watchdog.log'
$startupPath = Join-Path ([Environment]::GetFolderPath('Startup')) 'Katherine Blender Bridge.vbs'
$bridgeTaskName = 'Katherine Blender Bridge'
$watchdogTaskName = 'Katherine Blender Bridge Watchdog'

function Require-Command {
    param([Parameter(Mandatory = $true)][string]$Name)
    $cmd = Get-Command $Name -ErrorAction SilentlyContinue
    if (-not $cmd) { throw "Required command '$Name' was not found." }
    return $cmd.Source
}

function Escape-SingleQuotedString {
    param([Parameter(Mandatory = $true)][string]$Value)
    return $Value.Replace("'", "''")
}

function ConvertTo-ArrayLiteral {
    param([string[]]$Values)
    if (-not $Values -or $Values.Count -eq 0) { return '@()' }
    $items = foreach ($value in $Values) { "'$(Escape-SingleQuotedString $value)'" }
    return '@(' + ($items -join ', ') + ')'
}

Write-Host ''
Write-Host 'Repairing the Katherine Blender bridge...' -ForegroundColor Cyan

$ghExe = Require-Command 'gh'
$authOutput = & $ghExe auth status --hostname github.com 2>&1
if ($LASTEXITCODE -ne 0) {
    throw "GitHub CLI is not authenticated. Run 'gh auth login' once, then rerun this repair.`n$authOutput"
}

if (Get-Command 'py' -ErrorAction SilentlyContinue) {
    $pythonExe = (Get-Command 'py').Source
    $pythonArgs = @('-3')
    & $pythonExe -3 --version | Out-Null
} elseif (Get-Command 'python' -ErrorAction SilentlyContinue) {
    $pythonExe = (Get-Command 'python').Source
    $pythonArgs = @()
    & $pythonExe --version | Out-Null
} else {
    throw 'Python 3 was not found.'
}
if ($LASTEXITCODE -ne 0) { throw 'Python 3 could not be started.' }

New-Item -ItemType Directory -Path $installDir -Force | Out-Null

$encoded = & $ghExe api $bridgeApiPath --jq '.content'
if ($LASTEXITCODE -ne 0 -or -not $encoded) {
    throw "Could not download bridge.py from $repo."
}
$bytes = [Convert]::FromBase64String((($encoded -join '') -replace '\s', ''))
[IO.File]::WriteAllBytes($bridgePath, $bytes)

$installEsc = Escape-SingleQuotedString $installDir
$bridgeEsc = Escape-SingleQuotedString $bridgePath
$launcherEsc = Escape-SingleQuotedString $launcherPath
$logEsc = Escape-SingleQuotedString $logPath
$watchdogLogEsc = Escape-SingleQuotedString $watchdogLogPath
$pythonEsc = Escape-SingleQuotedString $pythonExe
$pythonArgsLiteral = ConvertTo-ArrayLiteral $pythonArgs
$ghEsc = Escape-SingleQuotedString $ghExe
$apiEsc = Escape-SingleQuotedString $bridgeApiPath

$launcher = @"
`$ErrorActionPreference = 'Continue'
`$bridgePath = '$bridgeEsc'
`$pythonExe = '$pythonEsc'
`$pythonArgs = $pythonArgsLiteral
`$ghExe = '$ghEsc'
`$bridgeApiPath = '$apiEsc'
`$logPath = '$logEsc'

`$mutex = New-Object System.Threading.Mutex(`$false, 'Local\KatherineBlenderChatBridgeSupervisor')
if (-not `$mutex.WaitOne(0, `$false)) { exit 0 }
try {
    while (`$true) {
        try {
            `$encoded = & `$ghExe api `$bridgeApiPath --jq '.content' 2>> `$logPath
            if (`$LASTEXITCODE -eq 0 -and `$encoded) {
                `$bytes = [Convert]::FromBase64String(((`$encoded -join '') -replace '\s', ''))
                [IO.File]::WriteAllBytes(`$bridgePath, `$bytes)
            }
        } catch {
            "[`$(Get-Date -Format s)] Update failed: `$_" | Add-Content `$logPath
        }

        "[`$(Get-Date -Format s)] Starting bridge PID supervisor" | Add-Content `$logPath
        & `$pythonExe @pythonArgs `$bridgePath *>> `$logPath
        `$exitCode = `$LASTEXITCODE
        "[`$(Get-Date -Format s)] Bridge exited with code `$exitCode; restarting in 5 seconds" | Add-Content `$logPath
        Start-Sleep -Seconds 5
    }
} finally {
    try { `$mutex.ReleaseMutex() } catch {}
    `$mutex.Dispose()
}
"@
Set-Content -LiteralPath $launcherPath -Value $launcher -Encoding UTF8

$watchdog = @"
`$ErrorActionPreference = 'Continue'
`$bridgePath = '$bridgeEsc'
`$launcherPath = '$launcherEsc'
`$watchdogLogPath = '$watchdogLogEsc'
`$ghExe = '$ghEsc'

`$mutex = New-Object System.Threading.Mutex(`$false, 'Local\KatherineBlenderChatBridgeWatchdog')
if (-not `$mutex.WaitOne(0, `$false)) { exit 0 }
try {
    `$bridgePattern = [Regex]::Escape(`$bridgePath)
    `$launcherPattern = [Regex]::Escape(`$launcherPath)
    `$processes = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue
    `$bridgeProcesses = @(`$processes | Where-Object { `$_.CommandLine -and `$_.CommandLine -match `$bridgePattern })
    `$launcherProcesses = @(`$processes | Where-Object { `$_.CommandLine -and `$_.CommandLine -match `$launcherPattern })

    `$mustRestart = (`$bridgeProcesses.Count -eq 0 -or `$launcherProcesses.Count -eq 0)
    `$reason = 'process missing'

    if (-not `$mustRestart) {
        try {
            `$raw = & `$ghExe api 'repos/amuletmaiden/kt-bus/issues?state=open&per_page=100' 2>> `$watchdogLogPath
            if (`$LASTEXITCODE -eq 0 -and `$raw) {
                `$issues = `$raw | ConvertFrom-Json
                `$pending = @(`$issues | Where-Object { `$_.title -like '[[]BLENDER[]]*' })
                # Exclude commands already claimed by a running worker.
                `$pending = @(`$pending | Where-Object { `$_.title -notlike '[[]BLENDER:RUNNING[]]*' })
                foreach (`$issue in `$pending) {
                    `$age = (Get-Date).ToUniversalTime() - ([DateTime]`$issue.created_at).ToUniversalTime()
                    if (`$age.TotalSeconds -gt 90) {
                        `$mustRestart = `$true
                        `$reason = "unclaimed issue #`$(`$issue.number) is `$([int]`$age.TotalSeconds)s old"
                        break
                    }
                }
            }
        } catch {
            "[`$(Get-Date -Format s)] Queue check failed: `$_" | Add-Content `$watchdogLogPath
        }
    }

    if (`$mustRestart) {
        "[`$(Get-Date -Format s)] Restarting bridge: `$reason" | Add-Content `$watchdogLogPath
        `$processes | Where-Object {
            `$_.CommandLine -and (`$_.CommandLine -match `$bridgePattern -or `$_.CommandLine -match `$launcherPattern)
        } | ForEach-Object {
            Stop-Process -Id `$_.ProcessId -Force -ErrorAction SilentlyContinue
        }
        Start-Sleep -Seconds 2
        Start-Process powershell.exe -WindowStyle Hidden -ArgumentList @(
            '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', `$launcherPath
        )
    }
} finally {
    try { `$mutex.ReleaseMutex() } catch {}
    `$mutex.Dispose()
}
"@
Set-Content -LiteralPath $watchdogPath -Value $watchdog -Encoding UTF8

# Remove the older Startup-folder launcher; Task Scheduler is more durable.
Remove-Item -LiteralPath $startupPath -Force -ErrorAction SilentlyContinue

# Kill every old supervisor or bridge process, including stale hidden launchers.
$bridgePattern = [Regex]::Escape($bridgePath)
$launcherPattern = [Regex]::Escape($launcherPath)
Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
    Where-Object {
        $_.CommandLine -and ($_.CommandLine -match $bridgePattern -or $_.CommandLine -match $launcherPattern)
    } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
Start-Sleep -Seconds 2

# Register current-user scheduled tasks without requiring administrator rights.
$userId = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$principal = New-ScheduledTaskPrincipal -UserId $userId -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -RestartCount 999 `
    -RestartInterval (New-TimeSpan -Minutes 1) `
    -ExecutionTimeLimit (New-TimeSpan -Seconds 0)

$launchArgs = '-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "' + $launcherPath + '"'
$launchAction = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $launchArgs
$launchTrigger = New-ScheduledTaskTrigger -AtLogOn -User $userId
Register-ScheduledTask -TaskName $bridgeTaskName -Action $launchAction -Trigger $launchTrigger -Settings $settings -Principal $principal -Force | Out-Null

$watchdogArgs = '-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "' + $watchdogPath + '"'
$watchdogAction = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $watchdogArgs
$watchdogTrigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 1)
Register-ScheduledTask -TaskName $watchdogTaskName -Action $watchdogAction -Trigger $watchdogTrigger -Settings $settings -Principal $principal -Force | Out-Null

Start-ScheduledTask -TaskName $bridgeTaskName
Start-Sleep -Seconds 7
Start-ScheduledTask -TaskName $watchdogTaskName
Start-Sleep -Seconds 3

$processes = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue
$runningBridge = @($processes | Where-Object { $_.CommandLine -and $_.CommandLine -match $bridgePattern })
$runningLauncher = @($processes | Where-Object { $_.CommandLine -and $_.CommandLine -match $launcherPattern })

Write-Host ''
if ($runningBridge.Count -gt 0 -and $runningLauncher.Count -gt 0) {
    Write-Host 'Bridge repaired and running.' -ForegroundColor Green
} else {
    Write-Host 'Repair installed, but the process is not visible yet.' -ForegroundColor Yellow
}
Write-Host "Bridge log:   $logPath"
Write-Host "Watchdog log: $watchdogLogPath"
Write-Host "Tasks:        $bridgeTaskName; $watchdogTaskName"
Write-Host ''
