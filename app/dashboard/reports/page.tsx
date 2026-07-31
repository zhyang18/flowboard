import type { Metadata } from "next";
import ReportsDashboard from "./reports-dashboard";

export const metadata: Metadata = { title: "报表" };

export default function ReportsPage() {
  return <ReportsDashboard />;
}
