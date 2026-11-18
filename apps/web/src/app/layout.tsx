import type { Metadata, Viewport } from "next";
import { Anybody, Archivo, Archivo_Narrow } from "next/font/google";
import { AuthProvider } from "@/components/auth";
import { Header } from "@/components/header";
import "./globals.css";

const anybody = Anybody({ subsets: ["latin"], axes: ["wdth"], variable: "--font-anybody", display: "swap" });
const archivo = Archivo({ subsets: ["latin"], weight: ["400", "600"], variable: "--font-archivo", display: "swap" });
const archivoNarrow = Archivo_Narrow({
  subsets: ["latin"],
  weight: ["600"],
  variable: "--font-archivo-narrow",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "Gatepass", template: "%s · Gatepass" },
  description: "Reserved seats for flash sales: live seat maps, fair holds and QR tickets.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#1b1915",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${anybody.variable} ${archivo.variable} ${archivoNarrow.variable}`}>
      <body className="flex min-h-dvh flex-col">
        <AuthProvider>
          <Header />
          <main className="frame flex-1 py-10 sm:py-14">{children}</main>
          <footer className="frame pb-10">
            <div className="bar-top flex flex-wrap items-baseline justify-between gap-x-8 gap-y-2 pt-5">
              <span className="wordmark text-xl">Gatepass</span>
              <p className="label text-muted">Payments run in Dodo Payments test mode. No real money moves.</p>
            </div>
          </footer>
        </AuthProvider>
      </body>
    </html>
  );
}
