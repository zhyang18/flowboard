import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import LoginView from "./login-view";

export const dynamic = "force-dynamic";

/**
 * 根据会话状态渲染登录页或跳转工作台。
 *
 * @return 登录页面组件。
 */
export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect("/dashboard/workbench");

  return <LoginView />;
}
