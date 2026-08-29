# Contributing to Solo Company Marketing Pipeline

[简体中文](CONTRIBUTING.zh-CN.md) | English

Thanks for helping improve Solo Company Marketing Pipeline. This is an alpha
project that can operate a real Android phone and authenticated social accounts,
so honest capability reporting and privacy-safe evidence matter as much as code
quality.

## Before opening an issue

- Use the matching GitHub issue form.
- Search existing issues first.
- Remove API keys, cookies, account handles, device serials, local user paths,
  UI dumps, screenshots, database exports, and runtime logs. If a redacted
  excerpt is insufficient, use the private security-reporting path rather than
  a public issue.
- For phone setup problems, include the OS, Node/npm versions, phone
  manufacturer/model, Android version, and the relevant **redacted** Phone
  Doctor checks. Do not attach the complete report without reviewing it.
- State what happened, what you expected, and the smallest reliable
  reproduction.

## Development setup

```powershell
npm ci
npm run db:generate
npm run dev:local
```

The contributor UI can be developed without completing Phone mode. Any pull
request that claims to add or fix a real phone/platform capability must still
be verified against the requirements in `docs/agent-install.md` and
`AGENTS.md`.

## Architecture rules

Before changing a platform workflow, classify the change:

- **Shared pipeline capability:** control flow depends only on
  `PlatformAdapter`; normalized discovery, thresholds, deduplication,
  persistence, audit events, and review stay platform-agnostic.
- **Platform-specific capability:** package names, navigation, dialogs, search
  tabs, accessibility labels, share links, metric labels, date formats, pacing,
  and recovery behavior stay in the matching adapter or playbook.
- **Shared Android driver:** device discovery, ADB, Appium, UI source, taps,
  text input, and clipboard operations contain no platform-page semantics.

Do not add fixtures, fake links, random external IDs, or current-time
publication dates to make a live integration appear successful. Explicitly
name mocks and fallbacks and keep them out of production success paths.

## Pull request workflow

1. Create a focused branch from `main`.
2. Keep the change small enough to review and avoid unrelated formatting or
   dependency churn.
3. Update English and Chinese public documentation together when behavior,
   installation, security, or user-visible terminology changes.
4. Add or update tests for behavior changes.
5. Run:

   ```powershell
   npm run check
   ```

6. Complete the pull request template. Separate shared-pipeline changes from
   platform-specific changes, list real-device evidence, and identify anything
   that remains unverified.

Documentation-only changes do not require a physical phone, but they must not
claim that an unverified phone behavior works. Do not commit generated
`dist/`, local `.env`, `data/`, browser profiles, screenshots, APKs, or logs.

By contributing, you agree that your contribution is licensed under the
[Apache License 2.0](LICENSE).
