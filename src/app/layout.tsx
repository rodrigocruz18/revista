import type { Metadata, Viewport } from "next";
import { Inter, Playfair_Display } from "next/font/google";
import { magazineConfig } from "@/config/magazine";
import { IntroGate } from "@/components/intro/IntroGate";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const playfair = Playfair_Display({ subsets: ["latin"], variable: "--font-playfair" });

export const metadata: Metadata = {
  title: `${magazineConfig.name} · Edicion digital`,
  description: magazineConfig.description,
};

export const viewport: Viewport = {
  themeColor: magazineConfig.themeColor,
  width: "device-width",
  initialScale: 1,
  // Pinch-to-zoom stays enabled on purpose: it's the simplest, most familiar
  // way to zoom in and read on a phone (native browser gesture, no custom
  // code). The reader detects the OS-level zoom via `visualViewport` to
  // disable tap-to-turn-page while zoomed in.
  maximumScale: 5,
  userScalable: true,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className={`${inter.variable} ${playfair.variable} h-full antialiased`}>
      <body className="h-full min-h-full bg-[#0b0f0d]">
        <IntroGate>{children}</IntroGate>
      </body>
    </html>
  );
}
