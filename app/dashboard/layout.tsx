import { redirect } from "next/navigation";
import { getWorkspaceSettings } from "@/lib/settings";
import { getCurrentUser } from "@/lib/session";
import DashboardTopbar from "./dashboard-topbar";
import DashboardDialogProvider from "./dashboard-dialog-provider";
import MobileNavigation from "./mobile-navigation";
import DashboardSidebar from "./sidebar";

export const dynamic = "force-dynamic";

/**
 * 校验会话并渲染受保护的仪表盘框架。
 *
 * @param children 当前仪表盘子页面。
 * @return 仪表盘布局组件。
 */
export default async function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  const settings = await getWorkspaceSettings();

  return (
    <DashboardDialogProvider>
      <main className="dashboard-shell">
        <DashboardSidebar
          user={user}
          workspaceName={settings?.workspaceName ?? "FlowBoard 研发中心"}
        />
        <section className="dashboard-workspace">
          <DashboardTopbar user={user} />
          <div className="dashboard-content">{children}</div>
        </section>
        <MobileNavigation userRole={user.role} />
      </main>
    </DashboardDialogProvider>
  );
}
