# Agent installation contract

[简体中文](agent-install.zh-CN.md) | English

This is the source of truth for installing the complete Marketing Pipeline:
Core mode (Dashboard, Control API, database, and shared pipeline) plus Android
Phone mode. A Dashboard-only start is not considered a completed installation.

## Completion criteria

Installation is complete only when all of the following are true:

1. `npm run setup` succeeds.
2. `npm run phone:doctor:json` reports `ready: true`.
3. `npm start` keeps the Dashboard/Control API and Appium running, while
   reusing a reachable PostgreSQL instance or starting the bundled container.
4. `npm run health` returns HTTP 200.
5. The user can open the configured local Dashboard URL. For each platform the
   user intends to run, its app is installed, the user logs in on the physical
   phone, and the detected real account identity is confirmed.

Do not replace a missing phone, platform link, publication time, API response,
or account identity with fixtures or invented values.

## System dependencies

- Git
- Node.js 22.12 or newer and npm 10 or newer
- Docker Desktop or Docker Engine with Compose v2, unless the user deliberately
  supplies an already-reachable compatible PostgreSQL `DATABASE_URL`
- A physical Android phone and a USB data cable
- A Zhipu AutoGLM-Phone API key, stored by the user directly in local `.env`

`npm run setup` installs project dependencies, downloads the official Android
Platform Tools and Eclipse Temurin JDK 17 into `data/toolchain`, starts
PostgreSQL, and applies Prisma migrations. Appium and UiAutomator2 are locked in
`package-lock.json` and loaded from this project; do not depend on a random
global or npm-cache installation.

## Agent-led installation sequence

1. Detect the host OS and package manager. Install missing system dependencies
   with the host's normal package manager. JDK is installed locally by the
   repository. Ask before an operation that needs
   elevation or accepting a third-party license.
2. Clone the repository. If the directory already exists, preserve `.env` and
   `data/`; do not reset or overwrite user changes.
3. Run `npm run setup` from the repository root.
4. Run `npm run phone:doctor:json` and use its structured report. Exit code 2
   means the guided Phone setup is incomplete, not that the report is broken.
5. Continue diagnosing until an authorized Android device is reported:
   - No ADB device: ask whether a physical Android phone is connected with an
     unlocked screen and a USB data cable.
   - `unauthorized`: ask the user to accept the RSA fingerprint prompt on the
     phone, then rerun the doctor.
   - `offline`: reconnect the cable and run `adb kill-server` followed by
     `adb start-server`.
   - Windows sees USB hardware but ADB does not: determine manufacturer/model
     and install only the OEM's official USB driver.
6. If the model is not readable, inspect the host USB device list. If it still
   cannot be identified, ask the user for brand and full model name. Search the
   web for that exact model's official OEM instructions for enabling Developer
   options and USB debugging. Clearly distinguish OEM documentation from a
   generic Android fallback.
7. Confirm TikTok and/or Xiaohongshu is installed on the phone. The user must
   perform login, CAPTCHA, consent, and any risk-control steps on the phone.
8. If `autoGlmKey.ok` is false, open the official key page when browser control
   is available, otherwise provide the link:
   `https://open.bigmodel.cn/usercenter/apikeys`. Tell the user to create a key
   and paste it directly into local `.env` after `ZHIPU_API_KEY=`. Never ask the
   user to paste the key into chat and never print it back.
9. Rerun `npm run phone:doctor:json`. Do not declare success before `ready` is
   true.
10. Run `npm start`, keep it running, then run `npm run health` from a second
    terminal. If `MARKETING_PIPELINE_PORT` is set, use the matching Dashboard
    URL rather than assuming port 3210.

## Port recovery

- If the Dashboard/Control API is no longer listening, rerun `npm start`; on
  Windows, `npm run start:windows` starts the complete service in a hidden
  process.
- The Dashboard port is `MARKETING_PIPELINE_PORT` from `.env`, defaulting to
  3210. If it is occupied, choose a free local port and rerun `npm run health`.
- Appium currently uses local port 4723. The bundled PostgreSQL mapping uses
  local port 5432. Do not work around a conflict by binding any service to
  `0.0.0.0`.

## OS-specific notes

### Windows

Prefer `winget` for Git, Node.js LTS, and Docker Desktop. Verify
package IDs with `winget search` before installation. Docker Desktop may require
a reboot or the user to finish its first-run setup. Do not use WSL for USB phone
access unless USB passthrough is already configured.

If ADB does not see the phone, inspect present Plug-and-Play devices and use the
Android OEM driver directory linked from Android's official documentation. A
Google USB Driver is only appropriate for Google devices.

### macOS

Homebrew can install Git and Node; use the official Docker Desktop. macOS
normally does not require an OEM USB driver.

### Linux

Use the distribution package manager for Git, Docker/Compose, and `unzip`.
If ADB sees no device, check USB permissions/udev rules from Android's official
hardware-device documentation.

## Secret and network boundary

- `.env`, `data/`, phone UI dumps, browser profiles, logs, device serials, and
  screenshots are local-only.
- Keep ports 3210, 4723, and 5432 bound to `127.0.0.1`.
- Optional Xiaohongshu Comment Bot and Publisher APIs must also use loopback
  addresses. The publisher must follow the
  [Xiaohongshu Publisher API contract](xiaohongshu-publisher-contract.md).
- Do not register automatic startup unless the user explicitly asks for it.
- Do not expose the service through a tunnel, LAN binding, reverse proxy, or
  cloud host as part of installation.
- Do not attach Phone Doctor output, screenshots, logs, UI dumps, or database
  exports to a public issue without reviewing and redacting them first.

## Official references

- Codex project instructions with `AGENTS.md`:
  https://developers.openai.com/codex/guides/agents-md/
- Android hardware device and USB debugging:
  https://developer.android.com/studio/run/device
- Android developer options:
  https://developer.android.com/studio/debug/dev-options
- Android OEM USB drivers:
  https://developer.android.com/studio/run/oem-usb
- Appium UiAutomator2 installation:
  https://appium.io/docs/en/latest/quickstart/uiauto2-driver/
- AutoGLM-Phone:
  https://docs.bigmodel.cn/cn/guide/models/vlm/autoglm-phone
- Zhipu API keys:
  https://open.bigmodel.cn/usercenter/apikeys
