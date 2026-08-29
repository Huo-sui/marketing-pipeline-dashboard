# Marketing Pipeline

A local-first marketing workflow that combines Core mode (Dashboard, Control
API, database, and shared pipeline) with real Android Phone mode. Both modes
ship together; a Dashboard without a connected phone is not treated as a
complete installation.

Marketing Pipeline normalizes multi-platform discovery into a shared pipeline
for topic watches, source-post review, ideas, assets, generation jobs, release
drafts, metrics, and auditable runs. TikTok and Xiaohongshu use Android phone
adapters; additional platforms can be connected through normalized HTTP
adapters.

> Alpha: TikTok/Xiaohongshu phone discovery and the shared control plane are in
> active development. Publishing and engagement are not yet implemented by the
> current adapters and are never reported as successful by fallback data.

## Install with Codex or Claude Code

You can hand the repository to a coding agent and let it install dependencies,
diagnose the Android connection, guide Developer options/USB debugging, collect
the missing AutoGLM configuration, and start the local service.

- [Codex installation prompt](prompts/CODEX_INSTALL_PROMPT.md)
- [Claude Code installation prompt](prompts/CLAUDE_CODE_INSTALL_PROMPT.md)
- [Agent installation contract](docs/agent-install.md)

Copy the complete prompt for your agent. The agent must continue until
`npm run phone:doctor:json` reports `ready: true`; opening the Dashboard alone is
not success.

## Requirements

- Git
- Node.js 22.12+ and npm 10+
- Docker Desktop/Engine with Compose v2, unless `DATABASE_URL` already points to
  a compatible PostgreSQL instance
- A physical Android phone, unlocked and connected by a USB data cable
- Developer options and USB debugging enabled on that phone
- TikTok and/or Xiaohongshu installed and logged in by the user
- A Zhipu AutoGLM-Phone API Key

On Windows, some phones require the manufacturer's official OEM USB driver.
The installer downloads Android Platform Tools from Google's official download
host and Eclipse Temurin JDK 17 from Adoptium, then stores them only under the
ignored local `data/toolchain` directory. Appium and UiAutomator2 are locked
project dependencies.

## Manual installation

```powershell
git clone https://github.com/Huo-sui/marketing-pipeline-dashboard.git
cd marketing-pipeline-dashboard
npm run setup
npm run phone:doctor
```

If Phone Doctor reports a missing API Key, open the
[Zhipu API Keys page](https://open.bigmodel.cn/usercenter/apikeys), create a key,
and put it directly in local `.env`:

```dotenv
ZHIPU_API_KEY=your-key-here
```

Never paste a key into an issue, chat transcript, log, or commit. Then rerun:

```powershell
npm run phone:doctor
npm start
```

Open [http://127.0.0.1:3210](http://127.0.0.1:3210) and verify the service in a
second terminal:

```powershell
npm run health
```

`npm start` reuses the configured PostgreSQL when it is reachable; otherwise it
starts the repository's local PostgreSQL container. It also starts Appium,
Control API, and Dashboard. The service binds to `127.0.0.1`; do not expose
ports 3210, 4723, or 5432 to a LAN or the public internet.

## Phone setup states

`npm run phone:doctor:json` produces a structured report for agents and
distinguishes:

- no ADB device;
- Android device offline;
- device connected but USB debugging authorization pending;
- authorized Android device with manufacturer, model, Android version, and
  installed platform-app checks;
- unreadable model, which requires manual brand/model input and OEM research;
- missing JDK, Docker, Platform Tools, Appium, database URL, or AutoGLM key.

The user must perform login, CAPTCHA, consent, risk-control, and RSA fingerprint
approval directly on the phone. The agent should guide those steps but must not
pretend they happened.

## Useful commands

| Command | Purpose |
| --- | --- |
| `npm run setup` | Install locked dependencies, Phone tooling, PostgreSQL, and migrations |
| `npm run phone:install` | Download official Android Platform Tools and verify Phone dependencies |
| `npm run phone:doctor` | Human-readable full Phone readiness diagnosis |
| `npm run phone:doctor:json` | Structured diagnosis for Codex/Claude Code |
| `npm start` | Start PostgreSQL, Appium, Control API, and Dashboard |
| `npm run health` | Verify the live Control API and database |
| `npm run check` | Privacy audit, lint, unit tests, build, and high-severity dependency audit |
| `npm run start:windows` | Start the full local service in a hidden Windows process |
| `npm run startup:register` | Opt-in Windows logon startup registration |

## Platform architecture

The control plane depends on the `PlatformAdapter` contract rather than platform
name branches. Device discovery, ADB, Appium, UI source, taps, input, and
clipboard handling belong to the shared Android driver. Package names, search
tabs, dialogs, card semantics, share links, metric text, and publication-date
formats remain inside the matching platform adapter/playbook.

Every discovery result must contain a real external ID, canonical URL, author,
title, metrics, media type, matching term, raw evidence, and a real publication
time when required by the adapter. The pipeline never invents links, IDs, or
publication times to make a run pass.

See [Architecture v0.1](docs/architecture-v0.1.md) and the repository
[AGENTS.md](AGENTS.md) for the enforced boundaries.

## Data and privacy

- `.env` contains secrets and is ignored.
- Everything under `data/` except `.gitkeep` is ignored because it may contain
  artifacts, phone UI data, account handles, logs, device identifiers, or
  browser state.
- APKs, temporary screenshots, browser profiles, downloaded tools, and research
  captures are excluded from publication.
- `npm run audit:privacy` blocks common secret values, local user paths, and
  forbidden runtime files before release.

Read [SECURITY.md](SECURITY.md) before using real accounts. This project is not
affiliated with TikTok, Xiaohongshu, Zhipu AI, Google, or Appium. Users are
responsible for platform terms, account safety, and applicable law.

## Development

```powershell
npm ci
npm run db:generate
npm run check
npm run dev:local
```

The production data path uses PostgreSQL through the Control API and does not
fall back to demo fixtures when the database is unavailable.

## License

Licensed under the [Apache License 2.0](LICENSE).
