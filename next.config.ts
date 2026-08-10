import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
];

/**
 * 为全部页面和接口添加浏览器安全响应头。
 *
 * @return Next.js 响应头配置。
 */
async function headers(): Promise<
  Array<{ source: string; headers: Array<{ key: string; value: string }> }>
> {
  const productionHeaders =
    process.env.NODE_ENV === "production"
      ? [
          ...securityHeaders,
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains",
          },
          {
            key: "Content-Security-Policy",
            value:
              "default-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; object-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'",
          },
        ]
      : securityHeaders;
  return [{ source: "/(.*)", headers: productionHeaders }];
}

const nextConfig: NextConfig = {
  poweredByHeader: false,
  headers,
};

export default nextConfig;
