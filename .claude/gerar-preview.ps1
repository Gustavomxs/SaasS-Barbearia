$h = Get-Content index.html -Raw -Encoding UTF8
$inj = @'
<script>(function(){var o=window.matchMedia.bind(window);window.matchMedia=function(q){if(/reduced-motion/.test(q)&&!/reduzido/.test(location.hash)){return {matches:false,media:q,addEventListener:function(){},removeEventListener:function(){}}}return o(q)};
addEventListener("load",function(){var m=/y=([\d.]+)/.exec(location.hash);if(!m)return;var alvo=parseFloat(m[1]);
 setTimeout(function(){var H=document.documentElement.scrollHeight-innerHeight;var y=alvo<=1.0001?alvo*H:alvo;
  var passos=12,i=0;(function p(){i++;scrollTo(0,y*i/passos);if(i<passos)setTimeout(p,60);})();},3400);});})();</script>
'@
$inj = $inj + "`n" + '<link rel="stylesheet" href="sites-incriveis.css">'
$h = $h.Replace('<link rel="stylesheet" href="sites-incriveis.css">', $inj)
[IO.File]::WriteAllText((Join-Path (Get-Location) "teste-movimento.html"), $h, (New-Object Text.UTF8Encoding $false))
"teste regenerado"
