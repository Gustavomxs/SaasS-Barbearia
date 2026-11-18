# =====================================================================
# R10 - CONFIGURAR AS NOTIFICAÇÕES (chaves VAPID do Web Push) - rodar UMA vez
# Uso (no Terminal, dentro da pasta do projeto):
#   powershell -NoProfile -ExecutionPolicy Bypass -File .\plataforma\configurar-push.ps1
# Gera o par de chaves e guarda na Vercel (variáveis de ambiente do projeto).
# A chave privada nunca vai para o site nem para este chat: fica só na Vercel.
# Depois, publique de novo (publicar-vercel.ps1 ou tirar-do-ar.ps1) para valer.
# =====================================================================
$ErrorActionPreference = "Stop"
$base = Join-Path $env:USERPROFILE "r10-ferramentas"
$node = Join-Path $base "node-v26.13.1-win-x64"
$site = Join-Path $base "r10-barbearia"
if (-not (Test-Path (Join-Path $node "npx.cmd"))) { throw "Rode o publicar-vercel.ps1 uma vez antes (ele instala o Node.js)." }
if (-not (Test-Path (Join-Path $site ".vercel"))) { throw "Projeto da Vercel não encontrado em $site. Rode o publicar-vercel.ps1 uma vez antes." }
$env:Path = "$node;$env:Path"

Write-Host "Gerando as chaves..." -ForegroundColor Yellow
$json = & npx --yes web-push@3.6.7 generate-vapid-keys --json
$chaves = $json | ConvertFrom-Json
if (-not $chaves.publicKey -or -not $chaves.privateKey) { throw "Não foi possível gerar as chaves." }

Set-Location $site
function guardar($nome, $valor) {
  & npx --yes vercel@latest env rm $nome production --yes 2>$null | Out-Null
  $valor | & npx --yes vercel@latest env add $nome production | Out-Null
  Write-Host "  ok: $nome" -ForegroundColor Green
}
guardar "NEXT_PUBLIC_VAPID_PUBLIC_KEY" $chaves.publicKey
guardar "VAPID_PRIVATE_KEY" $chaves.privateKey
guardar "VAPID_EMAIL" "mailto:r10.barbearia01@gmail.com"
Set-Location $PSScriptRoot
Write-Host ""
Write-Host "Pronto! Agora publique de novo para as notificações funcionarem." -ForegroundColor Green
Write-Host "(Os barbeiros que já ativaram precisam ativar de novo, porque a chave mudou.)" -ForegroundColor DarkGray
