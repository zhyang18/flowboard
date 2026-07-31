import { redirect } from "next/navigation";
import { getWorkspaceSettings } from "@/lib/settings";
import { getCurrentUser } from "@/lib/session";
import DashboardTopbar from "./dashboard-topbar";
import MobileNavigation from "./mobile-navigation";
import DashboardSidebar from "./sidebar";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  const settings = await getWorkspaceSettings();

  return (
    <main className="dashboard-shell">
      <DashboardSidebar
        user={user}
        workspaceName={settings?.workspaceName ?? "FlowBoard 研发中心"}
      />
      <section className="dashboard-workspace">
        <DashboardTopbar user={user} />
        <div className="dashboard-content">{children}</div>
      </section>
      <MobileNavigation />
    </main>
  );
}
