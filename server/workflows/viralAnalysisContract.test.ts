import assert from "node:assert/strict";
import test from "node:test";
import { validateAnalysisPayload } from "./viralAnalysisContract.ts";

const valid = {
  summary: "有真实证据支撑的摘要",
  viralReasons: [{ claim: "首屏信息差", evidence: ["点赞高于保存阈值"], confidence: "medium" }],
  production: { mediaType: "image_text", hook: "先给结论", structure: ["结论", "证据"], videoMethod: [], writingMethod: ["短标题"], imageTypes: ["项目截图"] },
  replicationDecision: { verdict: "adapt", reason: "结构可迁移", portableElements: ["信息顺序"], mustReplace: ["原帖措辞"] },
  topicCandidates: [{ title: "项目化选题", hook: "项目自己的开场", format: "图文", copyOutline: ["问题", "方案"], assetStrategy: "reuse_project_asset", assetIds: [], imageBrief: "使用项目截图" }],
  insights: [{ kind: "pain_point", title: "反馈不清晰", detail: "用户不理解状态变化", evidenceType: "inference", commentIds: [] }],
  limitations: ["没有评论证据"],
};

test("accepts a complete viral analysis contract", () => {
  assert.equal(validateAnalysisPayload(valid).summary, valid.summary);
});

test("rejects a partial analysis that would crash the UI", () => {
  assert.throws(() => validateAnalysisPayload({ summary: "只有摘要" }), /production|viralReasons/);
});

test("rejects unsupported evidence enums", () => {
  assert.throws(() => validateAnalysisPayload({ ...valid, viralReasons: [{ ...valid.viralReasons[0], confidence: "certain" }] }), /confidence/);
});
