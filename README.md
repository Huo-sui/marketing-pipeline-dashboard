# Marketing Pipeline Dashboard

Local-first control plane for a modular, multi-project marketing pipeline.

The current milestone establishes the Dashboard and workflow boundaries before external platform APIs are connected. Every sample post, metric, account, and generation job in the UI is explicitly provided by `Demo Seed Provider`; it is not live platform data.

## Current Surface

- Project selection and reusable channel model
- Fixed-topic radar and daily collection schedule
- Ranked source-post inbox with `Engage` and `Adapt` decisions
- Idea approval board
- Image/video generation queue
- Multi-platform release batch review
- Account and connector inventory
- Responsive desktop and mobile layouts

## Local Development

```powershell
npm install
npm run dev:local
```

Open [http://127.0.0.1:3210](http://127.0.0.1:3210).

## Validation

```powershell
npm run check
```

This runs lint, the production TypeScript/Vite build, and a high-severity dependency audit.

## Architecture

The Dashboard is a Refine application over capability-specific provider contracts. It intentionally does not integrate an all-in-one social media suite. Discovery, extraction, media download, visual analysis, idea planning, generation, localization, publishing, and metrics can each be replaced independently.

See [docs/architecture-v0.1.md](docs/architecture-v0.1.md) for the system boundaries and staged API roadmap.

## Demo Boundary

`src/data/demoData.ts` is the only seeded content source. Replace resources one at a time through `src/data/demoDataProvider.ts`; do not make downstream pages depend on a platform-specific response shape.
