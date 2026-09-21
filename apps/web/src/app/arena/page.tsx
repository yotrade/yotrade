import type { Metadata } from "next";

import { ArenaScreen } from "@/components/arena-screen.tsx";

export const metadata: Metadata = { title: "Arena" };

export default function ArenaPage() {
  return <ArenaScreen />;
}
