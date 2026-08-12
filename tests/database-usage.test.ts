import assert from "node:assert/strict";
import test from "node:test";
import {
  formatStorageBytes,
  NEON_FREE_STORAGE_LIMIT_BYTES,
  remainingStorageBytes,
} from "../lib/database-usage";

test("Neon Free 总容量会按十进制格式化为 500 MB", () => {
  assert.equal(formatStorageBytes(NEON_FREE_STORAGE_LIMIT_BYTES), "500 MB");
});

test("剩余容量会扣除数据库已用字节数且不会小于零", () => {
  assert.equal(remainingStorageBytes(125_000_000), 375_000_000);
  assert.equal(remainingStorageBytes(600_000_000), 0);
});

test("数据库容量会自动选择便于阅读的单位", () => {
  assert.equal(formatStorageBytes(12_345_678), "12.3 MB");
  assert.equal(formatStorageBytes(0), "0 B");
});
