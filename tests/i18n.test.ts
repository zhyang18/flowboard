import test from "node:test";
import assert from "node:assert/strict";
import { translations, SUPPORTED_LOCALES } from "../lib/i18n/translations";

/**
 * 递归获取对象的所有叶子节点键路径。
 *
 * @param obj 待遍历的对象。
 * @param prefix 当前前缀路径。
 * @return 完整键路径数组。
 */
function getLeafKeys(obj: Record<string, unknown>, prefix = ""): string[] {
  let keys: string[] = [];
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      keys = keys.concat(getLeafKeys(value as Record<string, unknown>, fullKey));
    } else {
      keys.push(fullKey);
    }
  }
  return keys;
}

test("支持的语言列表中包含 zh 和 en", () => {
  const codes = SUPPORTED_LOCALES.map((item) => item.code);
  assert.ok(codes.includes("zh"));
  assert.ok(codes.includes("en"));
});

test("中文词典和英文词典结构必须完全一致", () => {
  const zhKeys = getLeafKeys(translations.zh as unknown as Record<string, unknown>).sort();
  const enKeys = getLeafKeys(translations.en as unknown as Record<string, unknown>).sort();

  assert.deepEqual(zhKeys, enKeys, "中文与英文词典的键必须完全对称");
});

test("翻译词典中不应有空值或未定义的键", () => {
  for (const locale of ["zh", "en"] as const) {
    const dict = translations[locale] as unknown as Record<string, unknown>;
    const keys = getLeafKeys(dict);
    for (const key of keys) {
      const parts = key.split(".");
      let val: unknown = dict;
      for (const part of parts) {
        val = (val as Record<string, unknown>)[part];
      }
      assert.equal(typeof val, "string", `${locale} 下 ${key} 必须为字符串`);
      assert.ok((val as string).trim().length > 0, `${locale} 下 ${key} 不能为空`);
    }
  }
});
