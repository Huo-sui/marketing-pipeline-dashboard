import assert from "node:assert/strict";
import test from "node:test";
import { discoverXiaohongshuViaMcp, XiaohongshuMcpError, xiaohongshuMcpConfigurationState, type XiaohongshuMcpConfiguration } from "./xiaohongshuMcpAdapter.ts";

const accountId = "123e4567-e89b-42d3-a456-426614174000";
const config: XiaohongshuMcpConfiguration = { baseUrl: "http://127.0.0.1:18060", accountId, timeoutMs: 10_000 };
const png = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 0]);
const captureDetailScreenshot = async () => ({ bytes: Buffer.from(png), mimeType: "image/png" as const, capturedAt: new Date().toISOString(), source: "device_screenshot" as const });

function toolResponse(text: string, isError = false) {
  return new Response(JSON.stringify({ jsonrpc: "2.0", id: "test", result: { content: [{ type: "text", text }], isError } }), { status: 200, headers: { "Content-Type": "application/json" } });
}

function request() {
  return { accountId, traceId: "trace", terms: ["AI 阅读"], policy: { candidateLimitPerTerm: 3 as const, mediaTypeFilter: "image_text" as const } };
}

test("MCP 地址必须显式绑定已确认账号才能启用", () => {
  assert.equal(xiaohongshuMcpConfigurationState({}), "missing");
  assert.equal(xiaohongshuMcpConfigurationState({ XIAOHONGSHU_MCP_BASE_URL: "http://127.0.0.1:18060" }), "invalid");
  assert.equal(xiaohongshuMcpConfigurationState({ XIAOHONGSHU_MCP_BASE_URL: "http://127.0.0.1:18060", XIAOHONGSHU_MCP_ACCOUNT_ID: accountId }), "configured");
});

test("MCP 使用已验证筛选、只读取前三条并保留标题正文与真实链接", async () => {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const fetchImpl: typeof fetch = async (_input, init) => {
    const body = JSON.parse(String(init?.body)) as { params: { name: string; arguments: Record<string, unknown> } };
    calls.push({ name: body.params.name, args: body.params.arguments });
    if (body.params.name === "check_login_status") return toolResponse("✅ 已登录");
    if (body.params.name === "search_feeds") {
      return toolResponse(JSON.stringify({ feeds: [1, 2, 3, 4].map((number) => ({ id: `abcdef012345678${number}`, xsecToken: `token-${number}`, noteCard: { displayTitle: `搜索标题 ${number}`, type: "normal", user: { nickname: `作者 ${number}` }, interactInfo: { likedCount: `${number}万`, commentCount: `${number}00` }, cover: { urlDefault: `https://ci.xiaohongshu.example/${number}.png` } } })) }));
    }
    const id = String(body.params.arguments.feed_id);
    const number = Number(id.at(-1));
    return toolResponse(JSON.stringify({ note: { noteId: id, title: `标题 ${number}`, desc: `正文 ${number}`, type: "normal", time: 1_750_000_000, user: { nickname: `作者 ${number}` }, interactInfo: { likedCount: `${number}万`, commentCount: `${number}00` }, imageList: [{ urlDefault: `https://ci.xiaohongshu.example/${number}.png` }] }, comments: [] }));
  };

  const result = await discoverXiaohongshuViaMcp(request(), { config, fetchImpl, captureDetailScreenshot });
  assert.equal(result.posts.length, 3);
  assert.equal(result.posts[0].title, "标题 1");
  assert.equal(result.posts[0].body, "正文 1");
  assert.equal(result.posts[0].likes, 10_000);
  assert.equal(result.posts[0].comments, 100);
  assert.equal(result.posts[0].mediaType, "图文");
  assert.equal(result.posts[0].canonicalUrl, "https://www.xiaohongshu.com/explore/abcdef0123456781?xsec_token=token-1&xsec_source=pc_search");
  assert.equal(result.posts[0].coverEvidence.source, "device_screenshot");
  assert.equal(calls.filter((call) => call.name === "get_feed_detail").length, 3);
  const search = calls.find((call) => call.name === "search_feeds");
  assert.deepEqual(search?.args, { keyword: "AI 阅读", filters: { sort_by: "最多点赞", note_type: "图文", publish_time: "一周内", search_scope: "未看过" } });
});

test("字段不完整的 MCP 候选不会用默认值伪装成功", async () => {
  const fetchImpl: typeof fetch = async (_input, init) => {
    const body = JSON.parse(String(init?.body)) as { params: { name: string } };
    if (body.params.name === "check_login_status") return toolResponse("✅ 已登录");
    if (body.params.name === "search_feeds") return toolResponse(JSON.stringify({ feeds: [{ id: "abcdef0123456781", xsecToken: "token", noteCard: {} }] }));
    return toolResponse(JSON.stringify({ note: { noteId: "abcdef0123456781", title: "只有标题", desc: "", type: "normal", time: 1_750_000_000 } }));
  };
  const result = await discoverXiaohongshuViaMcp(request(), { config, fetchImpl, captureDetailScreenshot });
  assert.deepEqual(result.posts, []);
  assert.equal(result.logs.some((event) => event.eventType === "candidate_incomplete"), true);
});

test("验证码和风控会作为明确故障抛出供视觉回退处理", async () => {
  const fetchImpl: typeof fetch = async () => toolResponse("需要安全验证，请完成验证码", true);
  await assert.rejects(
    discoverXiaohongshuViaMcp(request(), { config, fetchImpl, captureDetailScreenshot }),
    (error: unknown) => error instanceof XiaohongshuMcpError && error.code === "risk_control",
  );
});

test("MCP 显式绑定账号与规则采集账号不一致时 fail closed", async () => {
  const mismatched = { ...request(), accountId: "123e4567-e89b-42d3-a456-426614174001" };
  await assert.rejects(
    discoverXiaohongshuViaMcp(mismatched, { config, fetchImpl: fetch, captureDetailScreenshot }),
    (error: unknown) => error instanceof XiaohongshuMcpError && error.code === "identity_mismatch",
  );
});

test("非法 feed_id 不能被拼成伪真实链接", async () => {
  const fetchImpl: typeof fetch = async (_input, init) => {
    const body = JSON.parse(String(init?.body)) as { params: { name: string } };
    if (body.params.name === "check_login_status") return toolResponse("✅ 已登录");
    if (body.params.name === "search_feeds") return toolResponse(JSON.stringify({ feeds: [{ id: "not-a-real-id", xsecToken: "token", noteCard: {} }] }));
    return toolResponse(JSON.stringify({ note: { noteId: "not-a-real-id", title: "标题", desc: "正文", type: "normal", time: 1_750_000_000, user: { nickname: "作者" }, interactInfo: { likedCount: "1万", commentCount: "100" } } }));
  };
  const result = await discoverXiaohongshuViaMcp(request(), { config, fetchImpl, captureDetailScreenshot });
  assert.deepEqual(result.posts, []);
  assert.equal(result.logs.some((event) => event.eventType === "candidate_incomplete" && event.message.includes("访问链接无效")), true);
});

test("MCP 候选必须取得详情首屏手机截图，平台原图不能冒充", async () => {
  const fetchImpl: typeof fetch = async (_input, init) => {
    const body = JSON.parse(String(init?.body)) as { params: { name: string } };
    if (body.params.name === "check_login_status") return toolResponse("✅ 已登录");
    if (body.params.name === "search_feeds") return toolResponse(JSON.stringify({ feeds: [{ id: "abcdef0123456781", xsecToken: "token", noteCard: {} }] }));
    return toolResponse(JSON.stringify({ note: { noteId: "abcdef0123456781", title: "标题", desc: "正文", type: "normal", time: 1_750_000_000, user: { nickname: "作者" }, interactInfo: { likedCount: "1万", commentCount: "100" } } }));
  };
  const result = await discoverXiaohongshuViaMcp(request(), { config, fetchImpl, captureDetailScreenshot: async () => ({ bytes: Buffer.from(png), mimeType: "image/png", capturedAt: new Date().toISOString(), source: "platform_api" }) });
  assert.deepEqual(result.posts, []);
  assert.equal(result.logs.some((event) => event.eventType === "candidate_incomplete" && event.message.includes("详情首屏手机截图")), true);
});

test("搜索候选 ID 与详情 noteId 串包时拒绝候选", async () => {
  const fetchImpl: typeof fetch = async (_input, init) => {
    const body = JSON.parse(String(init?.body)) as { params: { name: string } };
    if (body.params.name === "check_login_status") return toolResponse("✅ 已登录");
    if (body.params.name === "search_feeds") return toolResponse(JSON.stringify({ feeds: [{ id: "aaaaaaaaaaaaaaaa", xsecToken: "token", noteCard: {} }] }));
    return toolResponse(JSON.stringify({ note: { noteId: "bbbbbbbbbbbbbbbb", title: "B 的标题", desc: "B 的正文", type: "normal", time: 1_750_000_000, user: { nickname: "B 作者" }, interactInfo: { likedCount: "100万", commentCount: "1万" } } }));
  };
  const result = await discoverXiaohongshuViaMcp(request(), { config, fetchImpl, captureDetailScreenshot });
  assert.deepEqual(result.posts, []);
  assert.equal(result.logs.some((event) => event.eventType === "candidate_incomplete" && event.message.includes("身份不一致")), true);
});
