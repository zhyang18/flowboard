import { NextResponse } from "next/server";
import { deleteCurrentSession } from "@/lib/session";

export const runtime = "nodejs";

export async function POST() {
  await deleteCurrentSession();
  return NextResponse.json({ success: true });
}
