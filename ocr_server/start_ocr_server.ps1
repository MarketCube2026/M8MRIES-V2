$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$env:PADDLE_PDX_CACHE_HOME = if ($env:PADDLE_PDX_CACHE_HOME) { $env:PADDLE_PDX_CACHE_HOME } else { 'C:\ocr_paddlex_runtime' }
$env:OCR_PADDLE_CACHE = if ($env:OCR_PADDLE_CACHE) { $env:OCR_PADDLE_CACHE } else { 'C:\ocr_paddle_runtime' }
New-Item -ItemType Directory -Force $env:PADDLE_PDX_CACHE_HOME | Out-Null
$python = Get-Command python -ErrorAction SilentlyContinue
if ($python -and $python.Source -like '*WindowsApps*') {
  $bundledPython = 'C:\Users\admin\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe'
  if (Test-Path $bundledPython) { $python = Get-Item $bundledPython }
}
if (-not $python) { throw '未找到 Python，请安装 Python 3.11 x64' }
if (-not (Test-Path (Join-Path $PSScriptRoot '.env'))) { Copy-Item (Join-Path $PSScriptRoot '.env.example') (Join-Path $PSScriptRoot '.env') }
& $python.Source -c "import paddleocr, fastapi, httpx; print('PaddleOCR/FastAPI dependencies OK')"
if ($LASTEXITCODE -ne 0) { throw '缺少 OCR 依赖，请执行: python -m pip install -r ocr_server/requirements.txt' }
Push-Location $root
& $python.Source -m uvicorn ocr_server.main:app --host 127.0.0.1 --port 8100
Pop-Location
