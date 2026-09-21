import type { Metadata } from "next";

import { ActivityScreen } from "@/components/activity-screen.tsx";

export const metadata: Metadata = { title: "Activity" };

export default function ActivityPage() {
  return <ActivityScreen />;
}
