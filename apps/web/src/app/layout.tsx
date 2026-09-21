import type { Metadata, Viewport } from "next";
import { Geist_Mono, Inter } from "next/font/google";
import type { ReactNode } from "react";

import { Providers } from "./providers.tsx";
import "./globals.css";

const DESCRIPTION = "Who's the best trader in your community? Find out live on Monad.";
const SHARE_IMAGE = { url: "/icon-512.png", width: 512, height: 512, alt: "YoTrade" };

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "YoTrade", template: "%s · YoTrade" },
  description: DESCRIPTION,
  applicationName: "YoTrade",
  metadataBase: new URL("https://yotrade.xyz"),
  openGraph: {
    type: "website",
    siteName: "YoTrade",
    title: "YoTrade",
    description: DESCRIPTION,
    url: "/",
    images: [SHARE_IMAGE],
  },
  twitter: { card: "summary", title: "YoTrade", description: DESCRIPTION, images: [SHARE_IMAGE] },
};

export const viewport: Viewport = {
  themeColor: "#f4f4f6",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${geistMono.variable}`}>
      <body className="min-h-dvh font-sans antialiased">
        <Providers>
          <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-4 pb-[env(safe-area-inset-bottom)]">
            {children}
          </div>
        </Providers>
      </body>
    </html>
  );
}
