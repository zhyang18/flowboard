import assert from "node:assert/strict";
import test from "node:test";
import {
  attachmentDraftToken,
  draftAttachmentLimitError,
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

test("附件草稿会同时受单次编辑和用户待提交额度保护", () => {
  assert.equal(
    draftAttachmentLimitError({
      tokenCount: 9,
      tokenBytes: 20 * 1024 * 1024,
      userCount: 19,
      userBytes: 40 * 1024 * 1024,
      incomingBytes: 1024,
    }),
    null,
  );
  assert.match(
    draftAttachmentLimitError({
      tokenCount: 10,
      tokenBytes: 0,
      userCount: 10,
      userBytes: 0,
      incomingBytes: 1024,
    }) ?? "",
    /单次编辑/,
  );
  assert.match(
    draftAttachmentLimitError({
      tokenCount: 1,
      tokenBytes: 0,
      userCount: 19,
      userBytes: 47 * 1024 * 1024,
      incomingBytes: 2 * 1024 * 1024,
    }) ?? "",
    /48 MB/,
  );
});
