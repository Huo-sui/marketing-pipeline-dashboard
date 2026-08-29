# Security Policy

[简体中文](SECURITY.zh-CN.md) | English

Solo Company Marketing Pipeline is a local-first application that can control a
physical Android device and interact with authenticated social-platform
sessions. Treat the host, phone, `.env`, PostgreSQL data, and `data/` directory
as sensitive.

## Supported versions

Security fixes are provided for the latest code on the default branch. This is
alpha software; no older release line is currently maintained.

## Report a vulnerability privately

Use **Security -> Advisories -> Report a vulnerability** on this GitHub
repository. Do not open a public issue for a vulnerability before it has been
triaged.

Do not include live API keys, cookies, account handles, device serials, UI
dumps, screenshots containing account data, browser profiles, or unredacted
database exports. Provide the smallest redacted reproduction that demonstrates
the issue. Maintainers may request additional evidence through the private
advisory.

The following normally belong in a public bug report rather than a security
advisory: a port already being occupied, a missing OEM USB driver, an
`unauthorized` ADB device, a platform layout change, or an expected
`PUBLISHER_NOT_CONFIGURED` response with no secret exposure.

## Deployment boundary

- Keep the Dashboard/Control API and Appium bound to `127.0.0.1`. Keep the
  bundled PostgreSQL port mapping on `127.0.0.1` as well.
- Do not expose ports 3210, 4723, or 5432 through a LAN binding, tunnel,
  reverse proxy, port-forwarding rule, or public cloud host.
- This application is not hardened as a multi-user or internet-facing service.
- Never commit `.env` or anything below `data/` except `.gitkeep`.
- Store provider credentials only in local `.env`. The user must enter a key
  locally; agents and issue forms must never request that it be pasted into
  chat.
- Keep the phone locked when it is not actively being used. The application
  does not bypass device security and must not store a lock-screen credential.
- Review platform automation actions and use only accounts/content you are
  authorized to access.

## Before publishing or attaching diagnostics

Run:

```powershell
npm run audit:privacy
```

Then manually review the Git diff and every attachment. Automated scanning is
a guardrail, not proof that an artifact is safe to publish. Phone Doctor
redacts ADB serials, but its OS/device/package information may still be
sensitive in combination with other details.

## Third-party services

TikTok, Xiaohongshu, Zhipu AI, Google, Appium, Android OEMs, and configured HTTP
adapters have their own terms, security practices, and availability. This
project is not affiliated with them. Users remain responsible for account
safety, platform terms, copyright, privacy, and applicable law.
