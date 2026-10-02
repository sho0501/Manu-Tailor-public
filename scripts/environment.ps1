$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectRoot
foreach ($folder in @('data','database','uploads','output','models','cache','logs','temp')) {
    New-Item -ItemType Directory -Force -Path (Join-Path $projectRoot $folder) | Out-Null
}
$env:TEMP = Join-Path $projectRoot 'temp'
$env:TMP = $env:TEMP
$env:PIP_CACHE_DIR = Join-Path $projectRoot 'cache\pip'
$env:UV_CACHE_DIR = Join-Path $projectRoot 'cache\uv'
$env:HF_HOME = Join-Path $projectRoot 'cache\huggingface'
$env:TRANSFORMERS_CACHE = $env:HF_HOME
$env:npm_config_cache = Join-Path $projectRoot 'cache\npm'
$env:PNPM_HOME = Join-Path $projectRoot 'cache\pnpm-home'
$env:COREPACK_HOME = Join-Path $projectRoot 'cache\corepack'
$env:PLAYWRIGHT_BROWSERS_PATH = Join-Path $projectRoot 'cache\playwright'
$env:PYTHONIOENCODING = 'utf-8'
function Invoke-Checked {
    param([string]$Program, [string[]]$Arguments)
    & $Program @Arguments
    if ($LASTEXITCODE -ne 0) { throw "Command failed: $Program (exit $LASTEXITCODE)" }
}
