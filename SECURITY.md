# Security Policy

Marketing Pipeline is a local-first application that can control a real Android
device and read authenticated social-platform sessions. Treat the machine,
phone, `.env`, PostgreSQL volume, and `data/` directory as sensitive.

## Supported versions

Security fixes are provided for the latest release on the default branch.

## Reporting a vulnerability

Please use GitHub's private vulnerability reporting for this repository. Do
not include API keys, cookies, account handles, device serials, UI dumps, or
database exports in a public issue.

## Safe deployment boundary

- Keep the Dashboard and Appium bound to `127.0.0.1`.
- Never commit `.env` or anything below `data/`.
- Do not expose port 3210, 4723, or 5432 to a LAN or the public internet.
- Review platform automation actions and comply with the platform's terms and
  applicable law. This project is not affiliated with TikTok, Xiaohongshu,
  Zhipu AI, Google, or Appium.
