"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function LogoutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function logout() {
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
      className="logout-button"
      type="button"
      aria-label="退出登录"
      title="退出登录"
      disabled={pending}
      onClick={logout}
    >
      <LogOut size={16} />
    </button>
  );
}
