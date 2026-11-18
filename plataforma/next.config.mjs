/**
 * R10 — Next.js serve:
 *  · "/"            → o site animado (arquivo estático public/index.html, copiado na hora de publicar)
 *  · "/agenda"      → painel dos barbeiros (PWA)
 *  · "/api/notify-barber" → envia a notificação para o celular do barbeiro
 */
const nextConfig = {
  async rewrites() {
    return { beforeFiles: [{ source: "/", destination: "/index.html" }] };
  },
  async headers() {
    return [
      { source: "/:path*", headers: [
        { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" }
      ] },
      // o service worker precisa valer para /agenda e nunca ficar velho no cache
      { source: "/sw.js", headers: [
        { key: "Cache-Control", value: "no-cache" },
        { key: "Service-Worker-Allowed", value: "/agenda" }
      ] }
    ];
  }
};
export default nextConfig;
