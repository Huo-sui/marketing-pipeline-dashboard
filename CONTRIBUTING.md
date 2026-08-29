# Contributing

Thanks for helping improve Marketing Pipeline.

1. Create a focused branch from `main`.
2. Keep platform-specific UI semantics inside the matching platform adapter or
   playbook; keep the control plane dependent only on `PlatformAdapter`.
3. Never add real account data, API keys, device serials, UI hierarchies,
   browser profiles, screenshots, APKs, or runtime logs.
4. Run `npm ci` and `npm run check` before opening a pull request.
5. Describe which behavior was verified with a real device and which behavior
   remains unverified. Do not use fixtures or invented platform links to claim
   a live integration works.

By contributing, you agree that your contribution is licensed under
Apache License 2.0.
