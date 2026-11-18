import type { Metadata, Viewport } from "next";
import { AuthProvider } from "@/components/auth";
import { Header } from "@/components/header";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Gatepass", template: "%s · Gatepass" },
  description: "Reserved seats for flash sales: live seat maps, fair holds and QR tickets.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f5f2" },
    { media: "(prefers-color-scheme: dark)", color: "#121116" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh font-sans">
        <AuthProvider>
          <Header />
          <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
          <footer className="mx-auto max-w-6xl px-4 pb-10 text-xs text-muted">
            Payments run in Dodo Payments test mode. No real money moves.
          </footer>
        </AuthProvider>
      </body>
    </html>
  );
}
