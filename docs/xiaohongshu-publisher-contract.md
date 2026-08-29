# Xiaohongshu Publisher API contract

[简体中文](xiaohongshu-publisher-contract.zh-CN.md) | English

## Purpose and boundary

This contract isolates the shared pipeline from Xiaohongshu-specific phone
publishing. Marketing Pipeline freezes the human-approved ContentDraft,
account, runner, artifacts, and idempotency key. A platform-owned Publisher
service operates an authenticated physical Android phone, uploads the images or
video, fills the copy, and submits the post.

The repository does not bundle or imitate that external service. Xiaohongshu's
`publishing` capability becomes true only when
`XIAOHONGSHU_PUBLISHER_BASE_URL` is an HTTP(S) loopback URL using `127.0.0.1`,
`localhost`, or `::1`. Keep the optional credential only in local `.env` as
`XIAOHONGSHU_PUBLISHER_KEY`.

## Request

The service must expose `POST /publish`, accept JSON, and honor the
`Idempotency-Key` header. The request shape is:

```json
{
  "contractVersion": 1,
  "publicationDraftId": "uuid",
  "idempotencyKey": "stable-key",
  "platform": "小红书",
  "title": "Title",
  "copy": "Body copy",
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

The service must deduplicate by `idempotencyKey` and verify the phone's current
account against `account` before submission. Artifact `contentUrl` values are
available only from the local Control API; verify each SHA-256 digest before
uploading. Never rewrite the platform, account, draft version, or artifact set.

## Receipt

A successful result must contain a real platform post ID, a Xiaohongshu
canonical URL containing the same ID, and the platform-confirmed publication
time:

```json
{
  "status": "succeeded",
  "platformPostId": "0123456789abcdef",
  "canonicalUrl": "https://www.xiaohongshu.com/explore/0123456789abcdef",
  "publishedAt": "2026-08-29T12:00:00+08:00",
  "externalRequestId": "optional-provider-request-id"
}
```

The pipeline rejects a successful receipt whose domain, post ID, or timestamp
does not match. It never fills those fields with the current time or a random
ID.

An explicitly retryable pre-submission failure can return:

```json
{ "status": "failed_retryable", "code": "PHONE_LOCKED", "message": "The phone is locked" }
```

If the service touched the final submit action but cannot verify the result, it
must return:

```json
{ "status": "unknown_requires_review", "code": "RECEIPT_TIMEOUT", "message": "Submission outcome is unknown" }
```

Network failures, invalid responses, and HTTP errors become
`unknown_requires_review` and are never retried automatically, preventing
duplicate publication.

## Integration checklist

1. Bind the service only to a loopback address and validate the optional Bearer key.
2. Use a real confirmed account and a healthy Phone Runner.
3. Repeating the same idempotency key returns the same result without another post.
4. Build successful receipts from the real result and persist the external ID, canonical URL, and publication time.
5. Report locked phones, identity mismatches, CAPTCHA, risk control, and unknown outcomes explicitly.
6. Never log API keys, full device serials, account cookies, UI dumps, or artifact bytes.
