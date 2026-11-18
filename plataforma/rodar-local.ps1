# =====================================================================
# R10 - rodar o painel no computador para testar (http://localhost:4620/agenda)
# Uso: powershell -NoProfile -ExecutionPolicy Bypass -File .\plataforma\rodar-local.ps1 [-SoCompilar]
# Copia o projeto para C:\Users\<você>\r10-ferramentas\r10-dev (fora do OneDrive: node_modules é grande).
# =====================================================================
param([switch]$SoCompilar)
$ErrorActionPreference = "Stop"
$base = Join-Path $env:USERPROFILE "r10-ferramentas"
$node = Join-Path $base "node-v26.13.1-win-x64"
$dev  = Join-Path $base "r10-dev"
$origem = Split-Path $PSScriptRoot -Parent
$env:Path = "$node;$env:Path"
$env:NEXT_TELEMETRY_DISABLED = "1"

New-Item -ItemType Directory -Force $dev | Out-Null
Get-ChildItem $PSScriptRoot -Force | Where-Object { $_.Name -notin @("node_modules", ".next") } | Copy-Item -Destination $dev -Recurse -Force
$pub = Join-Path $dev "public"
foreach ($f in "index.html", "app.html", "sites-incriveis.css", "sites-incriveis.js", "robots.txt") { Copy-Item (Join-Path $origem $f) $pub -Force }
Copy-Item (Join-Path $origem "assets") $pub -Recurse -Force

Set-Location $dev
if (-not (Test-Path "node_modules\next")) { & npm.cmd install --no-audit --no-fund }
if ($SoCompilar) { & npx.cmd next build } else { & npx.cmd next dev -p 4620 }
