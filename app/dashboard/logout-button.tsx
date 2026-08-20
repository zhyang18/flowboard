"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslation } from "@/lib/i18n";
import { useDashboardDialog } from "./dashboard-dialog-provider";

type LogoutButtonProps = {
  variant?: "icon" | "menu";
};

/**
 * 渲染带二次确认并支持中英文国际化的退出登录按钮。
 *
 * @param props 组件属性。
 * @param props.variant 图标按钮或用户菜单按钮样式。
 * @return 退出登录按钮组件。
 */
export default function LogoutButton({ variant = "icon" }: LogoutButtonProps) {
  const router = useRouter();
  const { t } = useTranslation();
  const { confirm } = useDashboardDialog();
  const [pending, setPending] = useState(false);

  /**
   * 确认用户意图后注销当前会话并返回登录页。
   */
  async function logout() {
    const confirmed = await confirm({
      title: t("logout.title"),
      message: t("logout.message"),
      confirmLabel: t("logout.confirm"),
    });
    if (!confirmed) return;

    setPending(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      router.replace("/");
      router.refresh();
      setPending(false);
    }
  }

  return (
    <button
      className={`logout-button ${variant === "menu" ? "profile-menu-logout" : ""}`}
      type="button"
      aria-label={t("logout.button")}
      title={t("logout.button")}
      disabled={pending}
      onClick={logout}
    >
      <LogOut size={16} />
      {variant === "menu" && <span>{t("logout.button")}</span>}
    </button>
  );
}
