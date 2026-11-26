import type { Metadata, Viewport } from "next";
import { Archivo } from "next/font/google";
import { Providers } from "@/components/providers";
import "./globals.css";

// Una sola familia con eje de ancho: expandida para titulares, condensada para el POS.
const archivo = Archivo({
  subsets: ["latin"],
  axes: ["wdth"],
  variable: "--font-archivo",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "Tolva", template: "%s | Tolva" },
  description: "Pedidos, mostrador y delivery para cafeterías de especialidad.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#edefea" },
    { media: "(prefers-color-scheme: dark)", color: "#15100c" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es-AR" className={`${archivo.variable} h-full`} suppressHydrationWarning>
      <body className="min-h-full">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
