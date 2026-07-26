#Requires -RunAsAdministrator
# Removes only the obsolete PowerShell scheduled tasks from the old kt-bus setup.
# The silent pythonw Startup entry and bridge files are preserved.

$ErrorActionPreference = 'Continue'
$names = @('Katherine Blender Bridge Watchdog','Katherine Blender Bridge')

foreach ($name in $names) {
    Stop-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue
    Unregister-ScheduledTask -TaskName $name -Confirm:$false -ErrorAction SilentlyContinue
    & schtasks.exe /Delete /TN $name /F *> $null
}

$installDir = Join-Path $env:LOCALAPPDATA 'KatherineBlenderBridge'
$patterns = @(
    [Regex]::Escape((Join-Path $installDir 'watchdog.ps1')),
    [Regex]::Escape((Join-Path $installDir 'launch.ps1'))
)

Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
    Where-Object {
        $line = $_.CommandLine
        $line -and ($patterns | Where-Object { $line -match $_ })
    } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }

$remaining = @($names | Where-Object { Get-ScheduledTask -TaskName $_ -ErrorAction SilentlyContinue })
if ($remaining.Count -eq 0) {
    Write-Host 'Obsolete bridge scheduled tasks removed.' -ForegroundColor Green
} else {
    Write-Host ('Could not remove: ' + ($remaining -join ', ')) -ForegroundColor Red
    exit 1
}
