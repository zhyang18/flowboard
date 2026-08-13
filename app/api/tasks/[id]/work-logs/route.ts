import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import {
  tasks,
  users,
  workLogs,
} from "@/db/schema";
import { getProjectAccess } from "@/lib/authorization";
import { apiError } from "@/lib/api";
import { getCurrentUser } from "@/lib/session";

export const runtime = "nodejs";
type RouteContext = { params: Promise<{ id: string }> };

/**
 * 获取任务的所有工时登记记录。
 *
 * @param request 当前获取请求。
 * @param context 包含任务 ID 的路由上下文。
 * @return 任务的工时记录列表。
 */
export async function GET(request: Request, context: RouteContext) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return apiError("请先登录。", 401);

  const { id } = await context.params;
  const db = getDb();
  
  const [taskRecord] = await db
    .select({ projectId: tasks.projectId })
    .from(tasks)
    .where(eq(tasks.id, id))
    .limit(1);
  if (!taskRecord) return apiError("任务不存在。", 404);
  const access = await getProjectAccess(currentUser, taskRecord.projectId);
  if (!access) return apiError("任务不存在。", 404);

  const rows = await db
    .select({
      id: workLogs.id,
      durationHours: workLogs.durationHours,
      workDate: workLogs.workDate,
      note: workLogs.note,
      createdAt: workLogs.createdAt,
      user: {
        id: users.id,
        name: users.name,
      }
    })
    .from(workLogs)
    .innerJoin(users, eq(workLogs.userId, users.id))
    .where(eq(workLogs.taskId, id))
    .orderBy(desc(workLogs.createdAt));

  const data = rows.map((row) => ({
    ...row,
    createdAt: row.createdAt.toISOString(),
    workDate: row.workDate.toISOString().slice(0, 10),
  }));

  return NextResponse.json({ data });
}
