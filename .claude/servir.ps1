param([string]$Pasta = ".", [int]$Porta = 4600)
$raiz = (Resolve-Path $Pasta).Path
$tipos = @{ ".html"="text/html; charset=utf-8"; ".css"="text/css; charset=utf-8"; ".js"="text/javascript; charset=utf-8"; ".png"="image/png"; ".jpg"="image/jpeg"; ".svg"="image/svg+xml"; ".md"="text/plain; charset=utf-8"; ".ico"="image/x-icon"; ".webp"="image/webp" }
$l = New-Object System.Net.HttpListener
$l.Prefixes.Add("http://localhost:$Porta/")
$l.Start()
Write-Host "Servindo $raiz em http://localhost:$Porta"
while ($l.IsListening) {
  $ctx = $l.GetContext()
  try {
    $rel = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath.TrimStart('/'))
    if ($rel -eq "") { $rel = "index.html" }
    $arq = [IO.Path]::GetFullPath((Join-Path $raiz $rel))
    if (-not $arq.StartsWith($raiz) -or -not (Test-Path $arq -PathType Leaf)) {
      $ctx.Response.StatusCode = 404; $b = [Text.Encoding]::UTF8.GetBytes("404")
    } else {
      $ext = [IO.Path]::GetExtension($arq).ToLower()
      $ctx.Response.ContentType = $(if ($tipos[$ext]) { $tipos[$ext] } else { "application/octet-stream" })
      $ctx.Response.Headers.Add("Cache-Control", "no-store")
      $b = [IO.File]::ReadAllBytes($arq)
    }
    $ctx.Response.ContentLength64 = $b.Length
    $ctx.Response.OutputStream.Write($b, 0, $b.Length)
  } catch { } finally { $ctx.Response.Close() }
}
