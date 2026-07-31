import { eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { auditLogs, tasks, workLogs } from "@/db/schema";
import { apiError, canManageUsers } from "@/lib/api";
import { getCurrentUser } from "@/lib/session";

export const runtime = "nodejs";
type RouteContext = { params: Promise<{ id: string }> };

export async function DELETE(_request: Request, context: RouteContext) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return apiError("请先登录。", 401);

  const { id } = await context.params;
  const db = getDb();
  const [existing] = await db
    .select()
    .from(workLogs)
    .where(eq(workLogs.id, id))
    .limit(1);
  if (!existing) return apiError("工时记录不存在。", 404);
  if (existing.userId !== currentUser.id && !canManageUsers(currentUser)) {
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
