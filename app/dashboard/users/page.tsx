import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { canManageUsers } from "@/lib/authorization";
import { getCurrentUser } from "@/lib/session";
import UserManagement from "./user-management";

export const metadata: Metadata = {
  title: "用户管理",
};

export default async function UsersPage() {
  const user = await getCurrentUser();
  if (!user || !canManageUsers(user)) redirect("/dashboard");
  return <UserManagement currentUserId={user!.id} currentUserRole={user!.role} />;
}
