import { NextResponse } from "next/server";
import { deleteCurrentSession } from "@/lib/session";
import { apiError } from "@/lib/api";
import { hasTrustedOrigin } from "@/lib/request-security";

export const runtime = "nodejs";

/**
 * 删除当前会话并清空浏览器 Cookie。
 *
 * @param request 当前注销请求。
 * @return 注销结果。
 */
export async function POST(request: Request) {
  if (!hasTrustedOrigin(request)) return apiError("请求来源无效。", 403);
  await deleteCurrentSession();
  return NextResponse.json({ success: true });
}
