$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$env:PADDLE_PDX_CACHE_HOME = if ($env:PADDLE_PDX_CACHE_HOME) { $env:PADDLE_PDX_CACHE_HOME } else { 'C:\ocr_paddlex_runtime' }
$env:OCR_PADDLE_CACHE = if ($env:OCR_PADDLE_CACHE) { $env:OCR_PADDLE_CACHE } else { 'C:\ocr_paddle_runtime' }
New-Item -ItemType Directory -Force $env:PADDLE_PDX_CACHE_HOME | Out-Null
$projectPython = Join-Path $root '.venv\Scripts\python.exe'
$bundledPython = 'C:\Users\admin\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe'
$pythonPath = if (Test-Path $projectPython) {
  $projectPython
} elseif (Test-Path $bundledPython) {
  $bundledPython
} else {
  (Get-Command python -ErrorAction SilentlyContinue).Source
}
if (-not $pythonPath) { throw 'Compatible Python runtime was not found' }
if (-not (Test-Path (Join-Path $PSScriptRoot '.env'))) { Copy-Item (Join-Path $PSScriptRoot '.env.example') (Join-Path $PSScriptRoot '.env') }
& $pythonPath -c "import paddleocr, fastapi, httpx; print('PaddleOCR/FastAPI dependencies OK')"
if ($LASTEXITCODE -ne 0) { throw 'OCR dependencies are missing. Run: python -m pip install -r ocr_server/requirements.txt' }
Push-Location $root
& $pythonPath -m uvicorn ocr_server.main:app --host 127.0.0.1 --port 8100
Pop-Location
