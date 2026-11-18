import "./agenda.css";

export const metadata = {
  title: "R10 Agenda",
  description: "Agenda dos barbeiros da R10 Barbearia",
  robots: { index: false, follow: false },
  manifest: "/agenda.webmanifest",
  icons: { icon: "/icones/r10-192.png", apple: "/icones/r10-180.png" },
  appleWebApp: { capable: true, title: "R10 Agenda", statusBarStyle: "black-translucent" }
};

export const viewport = {
  width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#740200"
};

export default function Raiz({ children }) {
  return (
    <html lang="pt-BR">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,400..800&family=Big+Shoulders+Display:wght@700..900&display=swap" rel="stylesheet" />
      </head>
      <body>{children}</body>
    </html>
  );
}
