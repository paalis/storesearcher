import type { Metadata } from "next";
import { SettingsView } from "./SettingsView";

export const metadata: Metadata = { title: "Innstillinger" };

export default function Page() {
  return <SettingsView />;
}
