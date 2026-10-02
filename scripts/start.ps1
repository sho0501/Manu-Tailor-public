. "$PSScriptRoot\environment.ps1"
$python = Join-Path $projectRoot '.venv\Scripts\python.exe'
if (-not (Test-Path $python) -or -not (Test-Path 'apps/client/dist/index.html')) { & "$PSScriptRoot\setup.ps1" }
foreach ($port in @(8000,5173)) {
    $listener = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
    if ($listener) { throw "Port $port is already in use. Close the existing app or run stop.bat first." }
}
$bindHost = if ($env:MANU_BIND_HOST -eq '0.0.0.0') { '0.0.0.0' } else { '127.0.0.1' }
$backend = Start-Process -FilePath $python -ArgumentList @('-m','uvicorn','app.main:app','--host',$bindHost,'--port','8000') -WorkingDirectory "$projectRoot\apps\backend" -WindowStyle Hidden -PassThru -RedirectStandardOutput "$projectRoot\logs\backend-stdout.log" -RedirectStandardError "$projectRoot\logs\backend-stderr.log"
$node = (Get-Command node).Source
$frontend = Start-Process -FilePath $node -ArgumentList @('node_modules/vite/bin/vite.js','preview','--host','127.0.0.1','--port','5173') -WorkingDirectory "$projectRoot\apps\client" -WindowStyle Hidden -PassThru -RedirectStandardOutput "$projectRoot\logs\frontend-stdout.log" -RedirectStandardError "$projectRoot\logs\frontend-stderr.log"
@{backend=$backend.Id;frontend=$frontend.Id} | ConvertTo-Json | Set-Content 'temp\processes.json'
for ($i=0;$i -lt 30;$i++) {
    try {
        $health = Invoke-RestMethod 'http://127.0.0.1:8000/api/health'
        $page = Invoke-WebRequest 'http://127.0.0.1:5173' -UseBasicParsing
        if ($health.status -eq 'ok' -and $page.StatusCode -eq 200) { Start-Process 'http://127.0.0.1:5173'; Write-Host 'Manu-Tailor is running. Use stop.bat to stop.'; exit 0 }
    } catch { Start-Sleep -Seconds 1 }
}
throw 'Startup timed out. Check logs/backend-stderr.log and logs/frontend-stderr.log.'
