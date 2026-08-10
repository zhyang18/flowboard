"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

type LogoutButtonProps = {
  variant?: "icon" | "menu";
};

/**
 * 渲染带二次确认的退出登录按钮。
 *
 * @param variant 图标按钮或用户菜单按钮样式。
 * @return 退出登录按钮组件。
 */
export default function LogoutButton({ variant = "icon" }: LogoutButtonProps) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  /**
   * 确认用户意图后注销当前会话并返回登录页。
   *
   * @return 注销流程完成后的 Promise。
   */
  async function logout() {
    if (!window.confirm("确定要退出登录吗？")) return;

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
      aria-label="退出登录"
      title="退出登录"
      disabled={pending}
      onClick={logout}
    >
      <LogOut size={16} />
      {variant === "menu" && <span>退出登录</span>}
    </button>
  );
}
