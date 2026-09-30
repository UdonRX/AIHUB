import "./globals.css";

export const metadata = {
  title: "AI HUB",
  description: "検索・コード・画像をひとつに。",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "AI HUB" }
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0B0D0F"
};

export default function RootLayout({ children }) {
  return <html lang="ja"><body>{children}</body></html>;
}
