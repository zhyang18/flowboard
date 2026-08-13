import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/session";
import UserManagement from "./user-management";

export const metadata: Metadata = {
  title: "用户管理",
};

export default async function UsersPage() {
  const user = await getCurrentUser();
  return <UserManagement currentUserId={user!.id} currentUserRole={user!.role} />;
}
