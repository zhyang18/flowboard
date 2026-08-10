import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { canExportReports } from "@/lib/authorization";
import { getCurrentUser } from "@/lib/session";
import ReportsDashboard from "./reports-dashboard";

export const metadata: Metadata = { title: "报表" };

export default async function ReportsPage() {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/");
  return <ReportsDashboard canExport={canExportReports(currentUser)} />;
}
