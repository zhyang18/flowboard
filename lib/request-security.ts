import { createHash } from "node:crypto";

/**
 * 校验会改变服务端状态的请求是否来自当前站点。
 *
 * @param request 当前 HTTP 请求。
 * @return Origin 与当前站点一致或请求未携带 Origin 时返回 true。
 */
export function hasTrustedOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;

  try {
    const originUrl = new URL(origin);
    const requestUrl = new URL(request.url);
    const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
    const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
    const expectedHost = forwardedHost || request.headers.get("host") || requestUrl.host;
    const expectedProtocol = forwardedProto ? `${forwardedProto}:` : requestUrl.protocol;
    return originUrl.host === expectedHost && originUrl.protocol === expectedProtocol;
  } catch {
    return false;
  }
}

/**
 * 提取由可信部署平台写入的客户端地址。
 *
 * @param request 当前 HTTP 请求。
 * @return 客户端地址；无法识别时返回 unknown。
 */
export function getRequestIp(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip")?.trim() ||
    "unknown"
  ).slice(0, 128);
}

/**
 * 生成不包含原始邮箱和 IP 的登录限流键。
 *
 * @param email 规范化后的登录邮箱。
 * @param ipAddress 客户端地址。
 * @return SHA-256 十六进制限流键。
 */
export function loginRateLimitKey(email: string, ipAddress: string): string {
  return createHash("sha256")
    .update(`${email}\n${ipAddress}`)
    .digest("hex");
}
