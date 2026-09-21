import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import type { ReactNode } from "react";

import { Providers } from "./providers.tsx";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "YoTrade", template: "%s · YoTrade" },
  description: "Who's the best trader in your community? Find out live on Monad.",
  applicationName: "YoTrade",
};

export const viewport: Viewport = {
  themeColor: "#0e0b1a",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
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
