import { eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { auditLogs, tasks, workLogs } from "@/db/schema";
import { canManageProject, getProjectAccess } from "@/lib/authorization";
import { apiError } from "@/lib/api";
import { hasTrustedOrigin } from "@/lib/request-security";
import { getCurrentUser } from "@/lib/session";

export const runtime = "nodejs";
type RouteContext = { params: Promise<{ id: string }> };

/**
 * 删除本人或所管理项目的工时记录，并同步扣减任务实际工时。
 *
 * @param request 当前删除请求。
 * @param context 包含工时记录 ID 的路由上下文。
 * @return 删除成功标记。
 */
export async function DELETE(request: Request, context: RouteContext) {
  if (!hasTrustedOrigin(request)) return apiError("请求来源无效。", 403);
  const currentUser = await getCurrentUser();
  if (!currentUser) return apiError("请先登录。", 401);

  const { id } = await context.params;
  const db = getDb();
  const [existing] = await db
    .select({
      id: workLogs.id,
      taskId: workLogs.taskId,
      userId: workLogs.userId,
      durationHours: workLogs.durationHours,
      projectId: tasks.projectId,
    })
    .from(workLogs)
    .innerJoin(tasks, eq(workLogs.taskId, tasks.id))
    .where(eq(workLogs.id, id))
    .limit(1);
  if (!existing) return apiError("工时记录不存在。", 404);
  const access = await getProjectAccess(currentUser, existing.projectId);
  if (!access) return apiError("工时记录不存在。", 404);
  if (existing.userId !== currentUser.id && !canManageProject(currentUser, access)) {
    return apiError("无权删除该工时记录。", 403);
  }

  await db.transaction(async (tx) => {
    await tx.delete(workLogs).where(eq(workLogs.id, id));
    await tx
      .update(tasks)
      .set({
        actualHours: sql`greatest(0, ${tasks.actualHours} - ${existing.durationHours})`,
        updatedAt: new Date(),
      })
      .where(eq(tasks.id, existing.taskId));
    await tx.insert(auditLogs).values({
      actorId: currentUser.id,
      action: "work_log.delete",
      entityType: "work_log",
      entityId: id,
      metadata: {
        taskId: existing.taskId,
        userId: existing.userId,
        durationHours: existing.durationHours,
      },
    });
  });

  return NextResponse.json({ success: true });
}
