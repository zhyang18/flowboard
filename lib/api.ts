import { NextResponse } from "next/server";
import type { CurrentUser } from "./session";

/**
 * 构造统一 JSON 错误响应。
 *
 * @param message 面向用户的错误信息。
 * @param status HTTP 状态码。
 * @return Next.js JSON 响应。
 */
export function apiError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

/**
 * 判断用户是否具备组织级用户管理权限。
 *
 * @param user 当前登录用户。
 * @return 具备用户管理权限时返回 true。
 */
export function canManageUsers(user: Pick<CurrentUser, "role">): boolean {
  return user.role === "super_admin" || user.role === "project_admin";
}

/**
 * 规范化登录邮箱。
 *
 * @param value 原始邮箱值。
 * @return 去除首尾空白并转为小写的邮箱。
 */
export function normalizeEmail(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

/**
 * 读取并截断文本输入。
 *
 * @param value 原始文本值。
 * @param maxLength 允许的最大字符数。
 * @return 规范化文本，非字符串返回空字符串。
 */
export function textValue(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

/**
 * 判断数据库错误是否为唯一约束冲突。
 *
 * @param error 捕获到的未知错误。
 * @return PostgreSQL 错误码为 23505 时返回 true。
 */
export function isUniqueViolation(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "23505"
  );
}
