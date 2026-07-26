# Silent one-time installer for Katherine's normal-chat Blender bridge.
# Uses pythonw + a Startup-folder VBS entry. No persistent terminal windows.

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$repo = 'amuletmaiden/kt-bus'
$bridgeApiPath = 'repos/amuletmaiden/kt-bus/contents/blender-bridge/bridge.py'
$installDir = Join-Path $env:LOCALAPPDATA 'KatherineBlenderBridge'
$bridgePath = Join-Path $installDir 'bridge.py'
$supervisorPath = Join-Path $installDir 'supervisor.pyw'
$bridgeLogPath = Join-Path $installDir 'bridge.log'
$supervisorLogPath = Join-Path $installDir 'supervisor.log'
$startupPath = Join-Path ([Environment]::GetFolderPath('Startup')) 'Katherine Blender Bridge.vbs'

function Require-Command([string]$Name, [string]$Help) {
    $cmd = Get-Command $Name -ErrorAction SilentlyContinue
    if (-not $cmd) { throw "$Name is required. $Help" }
    return $cmd.Source
}

Write-Host ''
Write-Host 'Installing the silent Katherine Blender bridge...' -ForegroundColor Cyan

$ghExe = Require-Command 'gh' 'Install GitHub CLI, then run this installer again.'
& $ghExe auth status --hostname github.com *> $null
if ($LASTEXITCODE -ne 0) {
    Write-Host 'GitHub needs one-time authorization. A browser window will open.' -ForegroundColor Yellow
    & $ghExe auth login --hostname github.com --git-protocol https --web
    if ($LASTEXITCODE -ne 0) { throw 'GitHub authorization did not complete.' }
}
& $ghExe auth setup-git *> $null

# Prefer the windowless Python launcher. Fall back to pythonw.exe beside python.exe.
$pythonwExe = $null
$pythonwArgs = @()
if (Get-Command 'pyw' -ErrorAction SilentlyContinue) {
    $pythonwExe = (Get-Command 'pyw').Source
    $pythonwArgs = @('-3')
} elseif (Get-Command 'python' -ErrorAction SilentlyContinue) {
    $pythonExe = (Get-Command 'python').Source
    $candidate = Join-Path (Split-Path $pythonExe -Parent) 'pythonw.exe'
    if (Test-Path $candidate) { $pythonwExe = $candidate }
}
if (-not $pythonwExe) { throw 'pythonw.exe was not found. Install Python 3, then run this installer again.' }

New-Item -ItemType Directory -Path $installDir -Force | Out-Null

$encoded = & $ghExe api $bridgeApiPath --jq '.content'
if ($LASTEXITCODE -ne 0 -or -not $encoded) { throw "Could not retrieve bridge.py from $repo." }
[IO.File]::WriteAllBytes($bridgePath, [Convert]::FromBase64String((($encoded -join '') -replace '\s','')))

$ghPy = $ghExe.Replace('\','\\').Replace("'","\'")
$apiPy = $bridgeApiPath.Replace("'","\'")
$supervisor = @"
from __future__ import annotations
import base64, ctypes, datetime, os, subprocess, sys, time, traceback

INSTALL_DIR = os.path.dirname(os.path.abspath(__file__))
BRIDGE_PATH = os.path.join(INSTALL_DIR, 'bridge.py')
BRIDGE_LOG = os.path.join(INSTALL_DIR, 'bridge.log')
SUPERVISOR_LOG = os.path.join(INSTALL_DIR, 'supervisor.log')
STOP_FILE = os.path.join(INSTALL_DIR, '.supervisor_stop')
GH = r'$ghPy'
API_PATH = '$apiPy'
NO_WINDOW = getattr(subprocess, 'CREATE_NO_WINDOW', 0)


def log(message: str) -> None:
    with open(SUPERVISOR_LOG, 'a', encoding='utf-8') as f:
        f.write(f"[{datetime.datetime.now().isoformat(timespec='seconds')}] {message}\n")


def update_bridge() -> None:
    result = subprocess.run(
        [GH, 'api', API_PATH, '--jq', '.content'],
        capture_output=True, text=True, creationflags=NO_WINDOW, timeout=45,
    )
    if result.returncode != 0 or not result.stdout.strip():
        raise RuntimeError(result.stderr.strip() or 'empty bridge download')
    data = base64.b64decode(''.join(result.stdout.split()))
    temp = BRIDGE_PATH + '.new'
    with open(temp, 'wb') as f:
        f.write(data)
    os.replace(temp, BRIDGE_PATH)


def main() -> None:
    # One supervisor per Windows session.
    handle = ctypes.windll.kernel32.CreateMutexW(None, False, 'Local\\KatherineKtBusSilentSupervisor')
    if not handle or ctypes.windll.kernel32.GetLastError() == 183:
        return
    log('silent supervisor started')
    while True:
        if os.path.exists(STOP_FILE):
            try: os.remove(STOP_FILE)
            except OSError: pass
            log('stop requested')
            return
        try:
            update_bridge()
            log('bridge refreshed')
        except Exception as exc:
            log(f'update failed: {exc}')
        try:
            proc = subprocess.Popen(
                [sys.executable, BRIDGE_PATH, '--log', BRIDGE_LOG],
                cwd=INSTALL_DIR,
                creationflags=NO_WINDOW,
            )
            log(f'bridge started pid={proc.pid}')
            code = proc.wait()
            log(f'bridge exited code={code}; restarting in 5 seconds')
        except Exception:
            log(traceback.format_exc())
        time.sleep(5)


if __name__ == '__main__':
    main()
"@
Set-Content -LiteralPath $supervisorPath -Value $supervisor -Encoding UTF8

$exeEsc = $pythonwExe.Replace('"','""')
$argsText = if ($pythonwArgs.Count) { ($pythonwArgs -join ' ') + ' ' } else { '' }
$supervisorEsc = $supervisorPath.Replace('"','""')
$vbs = @"
Set sh = CreateObject("WScript.Shell")
sh.Run """$exeEsc"" $argsText""$supervisorEsc""", 0, False
"@
Set-Content -LiteralPath $startupPath -Value $vbs -Encoding ASCII

# Never recreate the obsolete PowerShell scheduled tasks. Remove them when ACLs permit.
foreach ($taskName in @('Katherine Blender Bridge Watchdog','Katherine Blender Bridge')) {
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
}

# Stop older bridge/supervisor processes owned by this installation.
$patterns = @([Regex]::Escape($bridgePath), [Regex]::Escape($supervisorPath))
Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
    Where-Object {
        $line = $_.CommandLine
        $line -and ($patterns | Where-Object { $line -match $_ })
    } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
Start-Sleep -Seconds 1

# Start through wscript so no console is ever allocated.
Start-Process -FilePath "$env:WINDIR\System32\wscript.exe" -ArgumentList @("`"$startupPath`"") -WindowStyle Hidden
Start-Sleep -Seconds 4

$running = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -and $_.CommandLine -match [Regex]::Escape($supervisorPath) }

Write-Host ''
if ($running) {
    Write-Host 'Installed, authenticated, silent, and running.' -ForegroundColor Green
} else {
    Write-Host 'Installed silently; startup may take a few more seconds.' -ForegroundColor Yellow
}
Write-Host "Autostart:      $startupPath"
Write-Host "Supervisor log: $supervisorLogPath"
Write-Host "Bridge log:     $bridgeLogPath"
Write-Host ''
Write-Host 'Keep Blender open with Blender MCP running on port 9876.' -ForegroundColor Cyan
