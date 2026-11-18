# =====================================================================
# R10 Barbearia - TIRAR O SITE DO AR (o site mostra "Em breve"; o painel /agenda continua funcionando)
# Uso:  powershell -NoProfile -ExecutionPolicy Bypass -File .\tirar-do-ar.ps1
# Para VOLTAR o site completo: powershell -NoProfile -ExecutionPolicy Bypass -File .\publicar-vercel.ps1
# =====================================================================
& (Join-Path $PSScriptRoot "publicar-vercel.ps1") -SoPainel
