. "$PSScriptRoot\environment.ps1"
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'Node.js 22 or later is required.' }
if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) { throw 'pnpm is required. Run corepack enable.' }
if (-not (Test-Path '.venv\Scripts\python.exe')) {
    if (Get-Command uv -ErrorAction SilentlyContinue) { Invoke-Checked uv @('venv','.venv') }
    else { Invoke-Checked python @('-m','venv','.venv') }
}
$python = Join-Path $projectRoot '.venv\Scripts\python.exe'
if (Get-Command uv -ErrorAction SilentlyContinue) { Invoke-Checked uv @('pip','install','--python',$python,'-r','apps/backend/requirements.lock') }
else { Invoke-Checked $python @('-m','pip','install','-r','apps/backend/requirements.lock') }
Invoke-Checked pnpm @('install','--frozen-lockfile')
Invoke-Checked pnpm @('build')
Push-Location 'apps/backend'
try { Invoke-Checked $python @('-m','app.seed') } finally { Pop-Location }
Write-Host 'Setup complete. Run start.bat.'
