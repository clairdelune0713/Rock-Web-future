import "./globals.css";

export const metadata = {
  title: "AIFX — Beyond the Five Gates",
  description: "An original scroll-driven fantasy portal experience.",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#c19a68",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="is-loading">{children}</body>
    </html>
  );
}
