import assert from "node:assert/strict";
import test from "node:test";
import {
  hasTrustedOrigin,
  loginRateLimitKey,
} from "../lib/request-security";

test("hasTrustedOrigin 接受当前站点来源", () => {
  const request = new Request("https://flowboard.example.com/api/tasks", {
    method: "POST",
    headers: { origin: "https://flowboard.example.com" },
  });
  assert.equal(hasTrustedOrigin(request), true);
});

test("hasTrustedOrigin 拒绝跨站来源", () => {
  const request = new Request("https://flowboard.example.com/api/tasks", {
    method: "POST",
    headers: { origin: "https://attacker.example" },
  });
  assert.equal(hasTrustedOrigin(request), false);
});

test("hasTrustedOrigin 支持反向代理转发主机", () => {
  const request = new Request("http://127.0.0.1:3000/api/tasks", {
    method: "POST",
    headers: {
      origin: "https://flowboard.example.com",
      "x-forwarded-host": "flowboard.example.com",
      "x-forwarded-proto": "https",
    },
  });
  assert.equal(hasTrustedOrigin(request), true);
});

test("loginRateLimitKey 输出稳定且不包含原始身份", () => {
  const first = loginRateLimitKey("user@example.com", "203.0.113.1");
  const second = loginRateLimitKey("user@example.com", "203.0.113.1");
  assert.equal(first, second);
  assert.equal(first.length, 64);
  assert.equal(first.includes("user@example.com"), false);
});
