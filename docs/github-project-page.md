# GitHub project-page copy and settings

[简体中文](github-project-page.zh-CN.md) | English

This file is the maintainer-facing source for public GitHub metadata. Keep the
English About text for broad discovery and link to `README.zh-CN.md` at the top
of the README for Chinese readers.

## About

**Description**

> Solo Company Marketing Pipeline: local-first Android discovery for Xiaohongshu and TikTok, with a modular generation-to-publishing roadmap.

**Website**

Leave blank until there is an official project site. Do not use a localhost,
temporary tunnel, or personal profile URL.

**Topics**

```text
content-intelligence
marketing-automation
social-media
local-first
human-in-the-loop
android-automation
appium
adb
xiaohongshu
tiktok
typescript
react
postgresql
solopreneur
creator-tools
```

Do not add `auto-publishing`, `comment-bot`, or similar topics until those real
capabilities are implemented and verified.

## Repository features

- Enable **Issues** and the checked-in issue forms.
- Keep **Private vulnerability reporting** enabled under Security.
- Discussions are optional; enable them only when someone will moderate them.
- Do not enable a public Pages site merely to expose the local Dashboard.
- Set the social preview only to a purpose-made, privacy-reviewed graphic. Do
  not use a runtime screenshot that contains project, account, or device data.

## Suggested labels

```text
type: bug
type: feature
type: documentation
area: installation
area: android-phone
area: platform-adapter
area: pipeline
area: ui
needs: reproduction
needs: real-device-validation
good first issue
```

Security reports must use private advisories rather than a public `security`
label.

## Branch protection for `main`

- Require a pull request before merging.
- Require the two matrix checks emitted by `.github/workflows/ci.yml`:
  `check (ubuntu-latest)` and `check (windows-latest)`.
- Require conversation resolution.
- Block force pushes and branch deletion.
- Keep administrator bypass available only for emergency recovery and document
  its use in the resulting pull request or release.

The hosted CI validates privacy rules, lint, unit tests, build, and dependency
audit. It cannot prove Android Phone readiness because GitHub runners do not
have the maintainer's physical phone or authenticated platform accounts.

## Release notes template

```markdown
## What changed

- User-visible outcome

## Verified

- `npm run check`
- Core/manual path that was exercised
- Real-device/platform path, when applicable (no private identifiers)

## Current limitations

- Capabilities that remain unavailable or unverified

## Installation and upgrade

- Configuration, migration, or restart steps

## Security and privacy

- Data-boundary changes, or "No change"
```

Use a clear prerelease marker for alpha releases. Never describe generation,
comment analysis, engagement, or publishing as available based only on UI,
schema, mock data, or an unconfigured provider record.

## Pre-publication checklist

1. Review `git status`, the complete diff, and all newly tracked files.
2. Run `npm run check` and record the result.
3. Run `npm run audit:privacy` again immediately before publication.
4. Confirm `.env`, `data/`, browser profiles, screenshots, APKs, UI dumps,
   database exports, and logs are not tracked or attached.
5. Confirm README English/Chinese links and capability tables agree.
6. Confirm installation docs match `package.json`, `scripts/setup.mjs`,
   `scripts/start.mjs`, and `scripts/phone-doctor.mjs`.
7. Separate real-device evidence from unverified behavior in release notes.
8. Verify that services still bind only to `127.0.0.1`.
