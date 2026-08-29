# Copy this prompt into Codex

Install and start the complete Marketing Pipeline on my local machine: Core
mode (Dashboard, Control API, database, and shared pipeline) plus Android Phone
mode. Repository:

https://github.com/Huo-sui/marketing-pipeline-dashboard

Own the installation through completion. A running Dashboard without a ready
physical Android phone is not success.

1. Inspect the host OS and safely install every missing system dependency: Git,
   Node.js 22.12+, npm 10+, and Docker with Compose v2. The repository installs
   its own local JDK 17. Use the native
   package manager and official sources. Ask before elevation, license
   acceptance, or a reboot, then continue afterward.
2. Clone the repository into a sensible local directory. If it already exists,
   preserve `.env`, `data/`, and user changes. After cloning, explicitly read
   `AGENTS.md` and `docs/agent-install.md` in full; Codex may have started before
   those project instructions existed in its context.
3. Run `npm run setup`, fix real dependency/setup failures, and never edit the
   application merely to bypass a prerequisite.
4. Run `npm run phone:doctor:json`. Continue until it reports `ready: true`:
   - Ask whether a physical phone is connected and confirm it is Android.
   - Require an unlocked phone and a USB cable that supports data.
   - Distinguish no device, `offline`, and `unauthorized`; for `unauthorized`,
     have me accept the RSA USB-debugging prompt on the phone.
   - If the phone model is not detected, inspect the host USB device list. If
     still unknown, ask me to type the brand and full model. Search the web for
     that exact model's official manufacturer instructions for enabling
     Developer options, USB debugging, and (on Windows) its OEM USB driver.
     Give me the exact on-phone steps and pause only for steps I must perform.
   - Re-run the doctor after each correction; do not assume a setting changed.
   - Confirm TikTok and/or Xiaohongshu is installed. I will perform logins,
     CAPTCHA, consent, and risk-control steps directly on the phone.
5. If AutoGLM is not configured, open the official Zhipu API-key page in my
   browser if browser control is available; otherwise give me this link:
   https://open.bigmodel.cn/usercenter/apikeys
   Guide me through registration and key creation. Tell me to paste the key
   directly into the repository's local `.env` after `ZHIPU_API_KEY=`. Never ask
   me to paste the key into chat, never echo it, and never commit `.env`.
6. Run `npm start` without exposing it beyond `127.0.0.1`. Keep it running, wait
   for readiness, and run `npm run health`.
7. Open or provide http://127.0.0.1:3210. Guide me through adding the detected
   phone-backed account, logging in on the phone, and confirming the real
   detected account identity.
8. Finish only after reporting: service URL, health result, redacted phone
   manufacturer/model and Android version, Phone Doctor READY status, installed
   platform apps, and any platform capability that is honestly still
   unimplemented. Do not claim publishing or engagement works unless its real
   adapter reports that capability and it was actually verified.

Keep keys, cookies, account details, device serials, UI dumps, logs, and browser
profiles private. Do not use fixtures, fake links, random IDs, or the current
time as a publication timestamp to manufacture success.
