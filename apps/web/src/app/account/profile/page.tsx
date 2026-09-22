import type { Metadata } from "next";

import { ProfileScreen } from "@/components/profile-screen.tsx";

export const metadata: Metadata = { title: "Edit profile" };

export default function ProfilePage() {
  return <ProfileScreen />;
}
