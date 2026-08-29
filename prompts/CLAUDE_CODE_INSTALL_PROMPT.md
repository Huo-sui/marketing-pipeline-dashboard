# Copy this prompt into Claude Code

Install and start the complete Marketing Pipeline on my local machine: Core
mode (Dashboard, Control API, database, and shared pipeline) plus Android Phone
mode. Repository:

https://github.com/Huo-sui/marketing-pipeline-dashboard

Work autonomously through all safe local steps. A Dashboard-only installation
is incomplete; success requires a real, authorized Android phone.

1. Detect the OS and install all missing prerequisites from official sources
   with the native package manager: Git, Node.js 22.12+, npm 10+, Docker with
   Compose v2. The repository installs its own local JDK 17. Ask before
   elevation, license acceptance, or reboot.
2. Clone the repository. If it exists, preserve `.env`, `data/`, and local
   changes. Explicitly read `CLAUDE.md`, `AGENTS.md`, and
   `docs/agent-install.md` completely before continuing.
3. Run `npm run setup`. Diagnose actual failures; do not change product code to
   hide missing dependencies.
4. Run `npm run phone:doctor:json` and iterate until `ready: true`:
   - Verify a physical Android phone is connected, unlocked, and attached with
     a USB data cable.
   - Handle no device, `offline`, and `unauthorized` separately. Ask me to
     accept the RSA prompt on the phone when authorization is pending.
   - If model detection fails, inspect the OS USB list. If still unknown, ask
     me for the exact brand/model. Research that exact model using the OEM's
     official site and give exact Developer options, USB debugging, and Windows
     OEM-driver steps. Re-run diagnostics after every user action.
   - Confirm TikTok and/or Xiaohongshu is installed. I must handle login,
     CAPTCHA, consent, and platform risk-control interactions on the phone.
5. If AutoGLM is missing, open the official page when possible or provide
   https://open.bigmodel.cn/usercenter/apikeys. Guide registration and API-key
   creation. Have me put the key directly in local `.env` as
   `ZHIPU_API_KEY=...`; never request the key in chat, print it, or commit it.
6. Start the product with `npm start`, bound only to `127.0.0.1`, keep it
   running, and verify it with `npm run health`.
7. Give me http://127.0.0.1:3210 and guide the in-product phone account setup
   until the real account identity is detected and I confirm it.
8. Only then summarize the URL, health status, redacted phone model/Android
   version, Phone Doctor READY result, installed platform apps, and any honestly
   unimplemented capability. Never invent platform data or claim an unverified
   adapter works.

Protect `.env`, keys, cookies, account details, serial numbers, UI dumps, logs,
and profiles. Do not use mock data, fake URLs, random external IDs, or fabricated
publication times to claim installation success.
