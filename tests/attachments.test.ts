import assert from "node:assert/strict";
import test from "node:test";
import {
  attachmentDraftToken,
  isEmbeddableImage,
  safeAttachmentName,
} from "../lib/attachments";

test("附件草稿令牌、文件名和可嵌入图片类型会被安全校验", () => {
  assert.equal(
    attachmentDraftToken("019ff002-c90c-48e0-b993-6591dba8a272"),
    "019ff002-c90c-48e0-b993-6591dba8a272",
  );
  assert.equal(attachmentDraftToken("not-a-token"), null);
  assert.equal(safeAttachmentName("C:\\fakepath\\测试截图.png"), "测试截图.png");
  assert.equal(isEmbeddableImage("image/png"), true);
  assert.equal(isEmbeddableImage("image/svg+xml"), false);
  assert.equal(isEmbeddableImage("application/pdf"), false);
});
