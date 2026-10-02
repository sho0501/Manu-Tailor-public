. "$PSScriptRoot\environment.ps1"
if (Test-Path 'temp\processes.json') {
    $ids = Get-Content 'temp\processes.json' -Raw | ConvertFrom-Json
    foreach ($processId in @($ids.backend,$ids.frontend)) {
        $process = Get-CimInstance Win32_Process -Filter "ProcessId=$processId" -ErrorAction SilentlyContinue
        if ($process -and ($process.CommandLine -like '*uvicorn app.main:app*' -or $process.CommandLine -like '*node_modules/vite/bin/vite.js*')) { Stop-Process -Id $processId -ErrorAction SilentlyContinue }
    }
    Remove-Item -LiteralPath 'temp\processes.json'
}
Write-Host 'Manu-Tailor stopped.'
