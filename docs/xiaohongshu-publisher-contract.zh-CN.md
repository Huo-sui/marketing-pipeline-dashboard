# 小红书 Publisher API 合同

简体中文 | [English](xiaohongshu-publisher-contract.md)

## 用途与边界

本合同把共享 Pipeline 与小红书手机发布实现隔离开。Marketing Pipeline 负责锁定已经人工批准的
ContentDraft、账号、Runner、图片 Artifact 与幂等键；平台专属 Publisher 服务负责操作已登录的
实体 Android 手机，上传图片或视频、填写文案并提交发布。

仓库不内置或伪装这项外部服务。只有 `XIAOHONGSHU_PUBLISHER_BASE_URL` 配置为
`127.0.0.1`、`localhost` 或 `::1` 的 HTTP(S) 地址时，小红书的 `publishing` Capability 才为
true。凭据只能放在本地 `.env` 的 `XIAOHONGSHU_PUBLISHER_KEY` 中。

## 请求

服务必须提供 `POST /publish`，接受 JSON，并同时读取 `Idempotency-Key` Header。请求结构：

```json
{
  "contractVersion": 1,
  "publicationDraftId": "uuid",
  "idempotencyKey": "stable-key",
  "platform": "小红书",
  "title": "标题",
  "copy": "正文",
  "account": {
    "id": "uuid",
    "externalUserId": "optional-real-id",
    "handle": "confirmed-handle",
    "displayName": "optional-name"
  },
  "runner": {
    "id": "uuid",
    "runnerType": "phone",
    "deviceId": "<bound-device>",
    "appPackage": "com.xingin.xhs"
  },
  "artifacts": [
    {
      "id": "uuid",
      "mimeType": "image/png",
      "originalName": "optional.png",
      "sha256": "hex-digest",
      "contentUrl": "http://127.0.0.1:3210/api/v1/artifacts/uuid/content"
    }
  ]
}
```

服务必须按 `idempotencyKey` 去重，并在真正提交前核对当前手机账号与 `account`。Artifact 的
`contentUrl` 只在本机 Control API 上可用；服务应校验 SHA-256 后再上传。不得临时改写平台、账号、
草稿版本或素材集合。

## 回执

成功必须返回真实平台帖子 ID、包含同一 ID 的小红书 Canonical URL，以及平台确认的发布时间：

```json
{
  "status": "succeeded",
  "platformPostId": "0123456789abcdef",
  "canonicalUrl": "https://www.xiaohongshu.com/explore/0123456789abcdef",
  "publishedAt": "2026-08-29T12:00:00+08:00",
  "externalRequestId": "optional-provider-request-id"
}
```

Pipeline 会拒绝域名、帖子 ID 或发布时间不一致的成功回执，不会用当前时间或随机 ID 补齐。

明确可重试失败可返回：

```json
{ "status": "failed_retryable", "code": "PHONE_LOCKED", "message": "手机未解锁" }
```

已经触碰提交按钮但无法确认结果时必须返回：

```json
{ "status": "unknown_requires_review", "code": "RECEIPT_TIMEOUT", "message": "提交结果未知" }
```

网络异常、无效响应或 HTTP 错误一律进入 `unknown_requires_review`，禁止自动重试，以免重复发布。

## 接入检查

1. 服务只监听回环地址，并验证可选 Bearer Key。
2. 使用真实已确认账号和健康 Phone Runner。
3. 用同一幂等键重复请求时返回同一结果，不重复发帖。
4. 成功回执来自真实发布结果；保存外部帖子 ID、Canonical URL 与发布时间。
5. 手机锁定、账号不匹配、验证码、风控和未知提交结果均明确失败或转人工核查。
6. 日志不得包含 API Key、完整设备序列号、账号 Cookie、UI Dump 或图片二进制。
