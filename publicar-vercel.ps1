# =====================================================================
# R10 Barbearia - publicar na Vercel (Next.js: site + painel /agenda + API de notificação)
# Uso (no Terminal, dentro da pasta do projeto):
#   powershell -NoProfile -ExecutionPolicy Bypass -File .\publicar-vercel.ps1            -> site completo + painel
#   powershell -NoProfile -ExecutionPolicy Bypass -File .\publicar-vercel.ps1 -SoPainel  -> só o painel /agenda; o site mostra "Em breve"
# 1) baixa o Node.js oficial (só na 1ª vez) e confere a assinatura SHA-256
# 2) monta o projeto em C:\Users\<você>\r10-ferramentas\r10-barbearia (pasta ligada à Vercel)
# 3) publica (a Vercel instala e compila o Next.js)
# =====================================================================
param([switch]$SoPainel)
$ErrorActionPreference = "Stop"
$ver   = "v26.13.1"
$nome  = "node-$ver-win-x64"
$base  = Join-Path $env:USERPROFILE "r10-ferramentas"
$node  = Join-Path $base $nome
$site  = Join-Path $base "r10-barbearia"
$origem = $PSScriptRoot

New-Item -ItemType Directory -Force $base | Out-Null
if (-not (Test-Path (Join-Path $node "npx.cmd"))) {
  Write-Host "Baixando Node.js $ver (nodejs.org)..." -ForegroundColor Yellow
  $zip = Join-Path $base "$nome.zip"
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
  Invoke-WebRequest -Uri "https://nodejs.org/dist/$ver/$nome.zip" -OutFile $zip -UseBasicParsing
  $somas = (Invoke-WebRequest -Uri "https://nodejs.org/dist/$ver/SHASUMS256.txt" -UseBasicParsing).Content
  $esperado = ((($somas -split "`n") | Where-Object { $_ -match "$nome\.zip$" }) -split "\s+")[0]
  $obtido = (Get-FileHash $zip -Algorithm SHA256).Hash.ToLower()
  if ($esperado -ne $obtido) { Remove-Item $zip; throw "Assinatura do Node.js não confere. Nada foi instalado." }
  Expand-Archive -Path $zip -DestinationPath $base -Force
  Remove-Item $zip
}
$env:Path = "$node;$env:Path"

Write-Host "Montando o projeto..." -ForegroundColor Yellow
if (Test-Path $site) { Get-ChildItem $site -Exclude ".vercel" | Remove-Item -Recurse -Force }
New-Item -ItemType Directory -Force $site | Out-Null

# 1) Next.js (painel /agenda, API, service worker, ícones)
$plat = Join-Path $origem "plataforma"
Get-ChildItem $plat -Force | Where-Object { $_.Name -notin @("node_modules", ".next", ".env.local") } | Copy-Item -Destination $site -Recurse -Force
$pub = Join-Path $site "public"
New-Item -ItemType Directory -Force $pub | Out-Null

# 2) site animado (arquivos estáticos em public/) - ou a página "Em breve"
if ($SoPainel) {
  Copy-Item (Join-Path $origem "em-breve\index.html") $pub
  Write-Host "Modo SÓ PAINEL: o site mostra 'Em breve'; /agenda funciona." -ForegroundColor Cyan
} else {
  foreach ($f in "index.html", "app.html", "sites-incriveis.css", "sites-incriveis.js", "robots.txt") {
    if (Test-Path (Join-Path $origem $f)) { Copy-Item (Join-Path $origem $f) $pub }
  }
  Copy-Item (Join-Path $origem "assets") $pub -Recurse
  Remove-Item (Join-Path $pub "assets\logo-original.png") -ErrorAction SilentlyContinue
}
[IO.File]::WriteAllText((Join-Path $site "vercel.json"), '{ "framework": "nextjs" }', (New-Object Text.UTF8Encoding $false))
Write-Host ("Arquivos: " + (Get-ChildItem $site -Recurse -File | Where-Object { $_.FullName -notmatch '\\\.vercel\\' }).Count) -ForegroundColor Green

Set-Location $site
$auth = Join-Path $env:APPDATA "com.vercel.cli\Data\auth.json"
if (-not (Test-Path $auth)) { & npx --yes vercel@latest login }
Write-Host ""
Write-Host "Publicando (a Vercel compila o Next.js, leva 1-2 minutos)..." -ForegroundColor Yellow
& npx --yes vercel@latest deploy --prod --yes
Set-Location $origem
