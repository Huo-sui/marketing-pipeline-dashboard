# Marketing Pipeline

[简体中文](README.zh-CN.md) | English

[![CI](https://github.com/Huo-sui/marketing-pipeline-dashboard/actions/workflows/ci.yml/badge.svg)](https://github.com/Huo-sui/marketing-pipeline-dashboard/actions/workflows/ci.yml)

Marketing Pipeline is a local-first, project-aware content intelligence
workflow. It collects real social posts through modular platform adapters,
normalizes the evidence into one auditable pipeline, and gives a human the
final say before a topic, creative, or release moves forward.

The product direction is:

`Topic Radar -> Topic Inbox -> analysis and feedback -> approved ideas -> reviewable drafts -> publishing`

The current alpha covers the first, evidence-heavy part of that path. It is
useful for teams that want to track project-specific topics, review strong
posts without losing their source evidence, and build a modular content
workflow instead of a one-off scraper.

> **Alpha status:** real Android Phone mode is part of the product, not an
> optional demo. TikTok and Xiaohongshu discovery are under active development.
> Repository-level viral-analysis and review-draft replication Skills plus their versioned record layers are
> included, but the bundled app does not autonomously run a model. Comment Bot,
> copy/image generation, video generation, and phone-publishing services are not bundled. The application
> records unavailable capabilities as unavailable; it does not manufacture a
> successful result with fixtures or fallback data.

## What works today

| Area | Current state |
| --- | --- |
| Project workspace | Projects, topic watches, account bindings, assets, ideas, draft records, and run history are persisted in PostgreSQL through the local Control API. |
| Topic Radar | Runs saved P0 watches with persisted thresholds. It does not depend on an agent manually operating the phone at runtime. |
| Android discovery | TikTok and Xiaohongshu have phone adapters built on ADB, Appium, and UiAutomator2. TikTok currently uses AutoGLM for a share-link fallback; Xiaohongshu uses a deterministic platform playbook. |
| Evidence pipeline | Stores real external IDs and canonical URLs, author/title/metrics, publication evidence required by the adapter, media type, matched term, raw evidence, metric snapshots, matches, and run events. |
| Qualification | Applies the saved hard thresholds and keeps relative anomaly cohorts within the same platform, topic watch, tracked term, and publication-age bucket. |
| Viral analysis | The repository-level `$viral-topic-analysis` Skill reads a privacy-minimized project/evidence DTO and saves a strictly validated, versioned breakdown. It never auto-approves ideas or invents missing media/comment evidence. |
| Topic and feedback workbench | **Topic Inbox** (`选题箱`) supports editable, versioned, human-reviewed ideas. A separate Inspiration Inbox stores pain points, feedback, and inspiration with evidence labels. |
| Reviewable drafts | Approved ideas can become independently versioned ContentDraft records. `$content-draft-replication` can save original copy, reuse project assets, or upload an original generated image and register it as a provenance-bearing Asset. Each revision freezes the exact idea, source-post, and analysis versions; video remains an explicit placeholder. |
| Comment collection | The Control API and Adapter contract can call a separately operated Xiaohongshu Comment Bot and store normalized evidence. No Bot is bundled, so the capability remains false until `XIAOHONGSHU_COMMENT_BOT_BASE_URL` is configured. |
| Publishing | A modular, idempotent Publisher call and strict real-receipt validation are implemented. After `XIAOHONGSHU_PUBLISHER_BASE_URL` points to a local service, explicit approval can hand the locked draft to that phone publisher. No service is bundled; an unconfigured run returns `PUBLISHER_NOT_CONFIGURED`. |

HTTP discovery adapters can also be configured for Douyin, Reddit, X, and
Instagram. They require a separate service that implements the normalized
`POST /discover` contract; this repository does not bundle those external
services or credentials.

## Product roadmap

The following items remain roadmap work rather than finished capabilities:

- Add authenticated multi-user identity to audit actors; the current app is a
  loopback-only, single-workspace local tool.
- Add real image-generation providers that persist artifacts and provenance,
  plus a replaceable video-generation module.
- Implement and verify separately operated platform-owned Comment Bot and Phone
  Publisher services. This repository provides their narrow contracts and only
  hands a publication draft to a loopback service after explicit approval.

Each stage is intended to be replaceable behind a narrow contract, so a
provider or platform failure remains local to that module.

See the bilingual [Xiaohongshu Publisher API contract](docs/xiaohongshu-publisher-contract.md)
for the request, receipt, idempotency, and safety boundary.

## Complete installation

Marketing Pipeline ships as one local installation with:

- **Core mode:** Dashboard, local Control API, PostgreSQL, and the shared
  pipeline.
- **Phone mode:** a real, authorized Android device controlled through ADB,
  Appium, and UiAutomator2.

A Dashboard-only start is useful for UI development, but it is not a complete
product installation.

### Requirements

- Git
- Node.js 22.12+ and npm 10+
- Docker Desktop/Engine with Compose v2, unless `DATABASE_URL` points to an
  already reachable compatible PostgreSQL instance
- A physical Android phone, unlocked and connected with a USB **data** cable
- Developer options and USB debugging enabled on the phone
- The platform app you intend to use, installed and logged in by you
- A Zhipu AutoGLM-Phone API key for capabilities that declare it as a runtime
  requirement (currently TikTok phone discovery)

On Windows, some devices also require the manufacturer's official OEM USB
driver. The setup script downloads Android Platform Tools from Google and
Eclipse Temurin JDK 17 from Adoptium into the ignored local `data/toolchain`
directory. Appium and UiAutomator2 are locked project dependencies.

### Agent-assisted installation

Give one of these prompts to a coding agent:

- [Codex installation prompt](prompts/CODEX_INSTALL_PROMPT.md)
  ([中文](prompts/CODEX_INSTALL_PROMPT.zh-CN.md))
- [Claude Code installation prompt](prompts/CLAUDE_CODE_INSTALL_PROMPT.md)
  ([中文](prompts/CLAUDE_CODE_INSTALL_PROMPT.zh-CN.md))
- [Agent installation contract](docs/agent-install.md)
  ([中文](docs/agent-install.zh-CN.md))

The agent must read `AGENTS.md`, run the setup and structured Phone Doctor, and
continue until `npm run phone:doctor:json` reports `ready: true`. Login,
CAPTCHA, consent, device authorization, and risk-control actions remain with
the user on the physical phone.

### Manual installation

```powershell
git clone https://github.com/Huo-sui/marketing-pipeline-dashboard.git
cd marketing-pipeline-dashboard
npm run setup
npm run phone:doctor:json
```

If Phone Doctor reports a missing API key, create one on the
[official Zhipu API Keys page](https://open.bigmodel.cn/usercenter/apikeys) and
write it directly to the repository's local `.env` file:

```dotenv
ZHIPU_API_KEY=your-key-here
```

Never paste a key into an issue, chat transcript, log, screenshot, or commit.
Then continue:

```powershell
npm run phone:doctor:json
npm start
```

Keep `npm start` running. In a second terminal:

```powershell
npm run health
```

Open [http://127.0.0.1:3210](http://127.0.0.1:3210). If you set
`MARKETING_PIPELINE_PORT` in `.env`, use that port instead. The service and
Appium bind to `127.0.0.1`; the bundled PostgreSQL mapping does too. Do not
expose ports 3210, 4723, or 5432 to a LAN or the public internet.

To hand approved drafts to a separately operated Xiaohongshu phone publisher,
set the loopback-only `XIAOHONGSHU_PUBLISHER_BASE_URL` and optional
`XIAOHONGSHU_PUBLISHER_KEY` in `.env`. The service must implement the
[Publisher API contract](docs/xiaohongshu-publisher-contract.md); leaving it
unconfigured does not affect discovery, analysis, or draft review.

## Phone Doctor states

`npm run phone:doctor:json` is the source of truth for machine-readable setup
status. It distinguishes:

- no ADB device;
- a device in `offline` state;
- a device awaiting USB-debugging authorization (`unauthorized`);
- an authorized Android device, with redacted serial and available
  manufacturer/model/version/package information;
- an unreadable model that requires manual brand/model identification and OEM
  documentation;
- missing Node.js, npm, Git, Docker/database, JDK, Platform Tools, Appium,
  UiAutomator2, database URL, or AutoGLM configuration.

The report lists whether TikTok and Xiaohongshu are installed, but a platform
workflow is not ready until its app is installed, the user is logged in, and
the real account identity is confirmed in the Dashboard.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run setup` | Install locked dependencies and phone tooling, generate Prisma Client, and apply migrations against existing or bundled PostgreSQL. |
| `npm run phone:install` | Install/verify the repository-local Android Platform Tools, Temurin JDK 17, Appium, and UiAutomator2 dependencies. |
| `npm run phone:doctor` | Print a human-readable phone and dependency diagnosis. |
| `npm run phone:doctor:json` | Print structured readiness data for Codex or another agent. Exit code 2 means setup is incomplete. |
| `npm start` | Start/reuse PostgreSQL, start/reuse Appium, and serve the Dashboard plus Control API locally. |
| `npm run health` | Verify the configured local Control API and database. |
| `npm run check` | Run the privacy audit, lint, unit tests, build, and high-severity dependency audit. |
| `npm run start:windows` | Start the complete local service in a hidden Windows process. |
| `npm run startup:register` | Opt in to Windows logon startup. It is never enabled by setup. |

If the Dashboard port is no longer listening, rerun `npm start` (or
`npm run start:windows` on Windows). If the configured Dashboard port is
occupied, choose a free `MARKETING_PIPELINE_PORT` in `.env` and rerun the
health check. Appium currently uses fixed local port 4723.

## Architecture boundaries

The control plane depends on the `PlatformAdapter` contract, not platform-name
branches. Shared Android infrastructure owns device discovery, ADB/Appium, UI
source, taps, text input, and clipboard operations. Package names, navigation,
dialogs, search tabs, accessibility text, share links, metric labels, and date
formats stay inside the matching platform adapter or playbook.

Every accepted discovery record uses real evidence. The pipeline never invents
a URL, external ID, metric, or publication time to make a run pass. See
[Architecture v0.1](docs/architecture-v0.1.md),
[the anomaly policy](docs/topic-radar-anomaly-policy.md), and
[AGENTS.md](AGENTS.md).

## Privacy, account safety, and responsible use

- `.env` is ignored and contains local secrets.
- Everything below `data/` except `.gitkeep` is ignored because it may contain
  artifacts, phone UI data, account identifiers, logs, or downloaded tools.
- Browser profiles, APKs, screenshots, UI dumps, database exports, and runtime
  logs must not be committed or attached to public issues.
- `npm run audit:privacy` scans publishable files for common secrets, personal
  local paths, and forbidden runtime artifacts.
- The application must remain bound to `127.0.0.1`. It is not hardened as a
  multi-user or internet-facing service.
- Use only accounts and content you are authorized to access. Respect platform
  terms, rate limits, copyright, privacy, and applicable law.

This project is not affiliated with TikTok, Xiaohongshu, Zhipu AI, Google,
Appium, or any other named platform/provider. Read [SECURITY.md](SECURITY.md)
before using a real account.

## Contributing

```powershell
npm ci
npm run db:generate
npm run check
npm run dev:local
```

Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening an issue or pull request.
For repository maintainers, [GitHub project-page copy and settings](docs/github-project-page.md)
contains the recommended About text, topics, branch protection, and release
checklist.

## License

Licensed under the [Apache License 2.0](LICENSE).
