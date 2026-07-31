import type { Metadata } from "next";
import SettingsPanel from "./settings-panel";

export const metadata: Metadata = { title: "设置" };

export default function SettingsPage() {
  return <SettingsPanel />;
}
