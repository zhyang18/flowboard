import { NextResponse } from "next/server";
import type { CurrentUser } from "./session";

export function apiError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export function canManageUsers(
  user: Pick<CurrentUser, "role">,
) {
  return user.role === "super_admin" || user.role === "project_admin";
}

export function normalizeEmail(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function textValue(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

export function isUniqueViolation(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "23505"
  );
}
