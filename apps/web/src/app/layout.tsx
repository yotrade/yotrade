import type { Metadata, Viewport } from "next";
import { Inter, Roboto_Mono } from "next/font/google";
import type { ReactNode } from "react";

import { OnboardingGate } from "@/components/onboarding-gate.tsx";
import { TabBar } from "@/components/tab-bar.tsx";
import { NavigationTracker } from "@/components/ui/back-button.tsx";
import { Providers } from "./providers.tsx";
import "./globals.css";

const DESCRIPTION = "Who's the best trader in your community? Find out live on Monad.";
const SHARE_IMAGE = { url: "/icon-512.png", width: 512, height: 512, alt: "YoTrade" };

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const robotoMono = Roboto_Mono({ variable: "--font-roboto-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "YoTrade", template: "%s | YoTrade" },
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
  themeColor: "#ffffff",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${robotoMono.variable}`}>
      <body className="min-h-dvh font-sans antialiased">
        <Providers>
          <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-5 pb-[env(safe-area-inset-bottom)]">
            <OnboardingGate>
              <div className="flex flex-1 flex-col">{children}</div>
              <TabBar />
              <NavigationTracker />
            </OnboardingGate>
          </div>
        </Providers>
      </body>
    </html>
  );
}
