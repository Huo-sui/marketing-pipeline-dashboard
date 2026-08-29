# Marketing Pipeline Architecture v0.1

- Status: Dashboard foundation implemented
- Date: 2026-08-14
- Scope: Local, single-operator, multi-project control plane

## 1. Decisions

1. Refine is the primary operational Dashboard.
2. Lightdash is not used. Operational data and analytics are shown in the same Dashboard.
3. No all-in-one social media system is a core dependency.
4. Integrations are separated by capability as well as platform.
5. The first signal source is a project-specific fixed Topic Watchlist, not global trend detection.
6. Agents produce versioned structured artifacts; they do not directly mutate downstream workflow state.
7. Human approval remains between Idea and Generation, and again before Release.

## 2. Product Flow

```text
Project Profile
  -> Topic Research
  -> Approved Watchlist
  -> Daily Discovery
  -> Source Post Normalization
  -> Topic-relative Ranking
  -> Human Decision: Ignore / Engage / Adapt
  -> Pattern Card and Idea
  -> Human Idea Approval
  -> Creative Spec
  -> Platform Renditions
  -> Human Release Approval
  -> Publish
  -> Metric Snapshots
```

The Dashboard supports multiple projects. Every business entity carries `project_id`. Accounts are shared through a many-to-many `ChannelBinding` rather than being owned by exactly one project.

## 3. Capability Boundaries

| Capability | Input | Output | Example provider candidates |
|---|---|---|---|
| Topic Research | `ProjectProfile` | `TopicCandidate[]` | Planner Agent + browser evidence |
| Discovery | `TopicQuery` | `SourcePostRef[]` | MediaCrawler search, TikTok-Api, twscrape, Playwright |
| Extraction | `SourcePostRef` | `SourcePost` | Per-platform extractor |
| Media Fetch | `SourcePostRef` | `MediaArtifact[]` | yt-dlp, platform-specific downloader |
| Comment Fetch | `SourcePostRef` | `SourceComment[]` | Per-platform comment collector |
| Visual Analysis | `MediaArtifact[]` | `PatternCard` | PySceneDetect + WhisperX + OCR + visual model |
| Idea Planning | `PatternCard + ProjectProfile` | `Idea[]` | Planner Agent |
| Generation | `CreativeSpec` | `Rendition[]` | ComfyUI, Remotion, FFmpeg |
| Localization | `CreativeSpec + Locale` | `LocalizedSpec` | Language provider |
| Preview | `Rendition + ChannelConfig` | `PlatformPreview` | Local simulator, then Playwright draft |
| Publishing | `PublicationDraft` | `PublicationReceipt` | Platform-specific Playwright Publisher |
| Metrics | `PublicationRef` | `MetricSnapshot` | Platform-specific metrics collector |

A provider implements one capability. A TikTok discovery provider is not required to publish, and a Xiaohongshu publisher is not allowed to call the idea planner.

## 4. Core Records

```text
ProjectProfile
TopicWatch
CollectionRun
SourcePost
SourceMetricSnapshot
EngagementOpportunity
PatternCard
Idea
CreativeSpec
MediaArtifact
Rendition
ReleaseBatch
PublicationDraft
PublicationReceipt
MetricSnapshot
AgentRun
ProviderRegistration
```

All async jobs carry:

```text
project_id
job_id
trace_id
idempotency_key
input_schema_version
provider_version
prompt_version
```

Large media files move through object storage using artifact identifiers or signed URLs. They are not embedded in JSON API request bodies.

## 5. Workflow States

### Source post

```text
CAPTURED -> QUALIFIED -> UNREVIEWED
                       -> ENGAGE
                       -> ADAPT
                       -> IGNORED
```

### Idea

```text
CANDIDATE -> APPROVED -> GENERATING -> READY_FOR_REVIEW
          -> REJECTED
```

### Publication

```text
PREPARE_DRAFT -> PLATFORM_PREVIEW -> RELEASE_APPROVED -> SUBMITTING
                                                    -> SUCCEEDED
                                                    -> FAILED_SAFE_TO_RETRY
                                                    -> UNKNOWN_REQUIRES_REVIEW
```

Browser publishing must never automatically retry an unknown submit result. It first reconciles against drafts and recent account posts to avoid duplicate publication.

## 6. Browser Worker

Each platform account receives an isolated persistent browser profile and a per-account write lock. Routine actions use deterministic Playwright playbooks. A repair agent is invoked only when selectors or page structure drift.

```text
Account Profile
  + Stable Browser Context
  + Platform Playbook Version
  + Rate/Write Gate
  + Failure Screenshot and DOM Snapshot
```

Interactive QR login is the only operation expected to require a visible browser window. Routine workers should run in the background.

## 7. Visual Pattern Agent

```text
Media Fetch
  -> FFmpeg normalization
  -> PySceneDetect shot boundaries
  -> WhisperX transcript and timing
  -> OCR overlays
  -> Multimodal analysis
  -> PatternCard JSON validation
```

`PatternCard` describes hook timing, shot rhythm, text density, story arc, proof point, CTA, audio function, portable structure, and elements that must be replaced. Source media is analysis evidence; it is not a default publication asset.

## 8. Dashboard Implementation

The Refine resource registry is already present for:

```text
overview
projects
topics
source-posts
ideas
generation
release
accounts
settings
```

The current `demoDataProvider` is an explicit local adapter. Pages consume normalized records and must not learn platform-specific fields. A real REST provider can replace one resource without changing the page component.

## 9. API Integration Order

1. Control API and PostgreSQL persistence for projects, topics, workflow state, and provider registrations.
2. Reddit Discovery + Extraction as the first read-only connector to validate normalized contracts.
3. Xiaohongshu Discovery wrapper around a dedicated MediaCrawler worker.
4. X Discovery through a dedicated twscrape worker.
5. Douyin and TikTok discovery/media connectors.
6. Visual Pattern Agent.
7. Idea Planner and Comment Composer.
8. Image Composer, then Remotion video rendering.
9. Assisted Playwright draft creation and preview.
10. Per-platform submit/reconciliation and metrics collectors.

Publishing is intentionally last. Read-only discovery and review must remain useful even when no account or publisher is connected.

## 10. Platform Adapter Contract

The control API exposes `GET /api/v1/platforms` and routes discovery through a
platform registry. Adapters declare mode (`phone` or `http`), capabilities,
runtime requirements (account binding, confirmed identity, phone runner,
visual provider), and the adapter's required extraction fields. The control
plane consumes only these declarations and normalized
records; it does not branch on platform names.

The reusable Android layer is `server/mobile/androidPhoneDriver.ts`. It owns
device discovery, ADB/Appium startup, UI source, taps, Unicode text input and
clipboard access. Platform page semantics do not belong there.

TikTok is `tiktok-phone-v1`. Xiaohongshu is
`xiaohongshu-phone-v1`; its search tabs, note accessibility labels, metrics,
share sheet and URL parsing are isolated in
`server/platforms/xiaohongshuPhoneAdapter.ts`. Both return normalized
`{ posts, logs }` with real external ID, canonical URL, author, title, metrics,
media type, matched term and raw evidence. Missing adapters or unmet runtime
requirements fail preflight explicitly; no fake data is written.

For any saved project, the one-click path is: choose the project, open Topic
Radar, and click `运行 P0 规则`. The UI invokes the persisted P0 rules; each rule runs
the same Discovery → extraction-contract assertion → qualification → SourcePost upsert → metric snapshot →
topic match → PipelineRun/RunEvent path. Codex is not part of this runtime.

Hard admission thresholds remain persisted TopicWatch configuration and are
never hard-coded in an adapter. Relative anomaly scoring is a shared pipeline
concern, but each cohort is restricted to the same platform, TopicWatch,
tracked term, and publication-age bucket. It compares like velocity, comment
velocity, and comment rate; insufficient samples produce an explicit
`insufficient_baseline` result instead of an invented score.

Adapters own the evidence required to normalize platform fields. Xiaohongshu
scrolls the note body until it finds standalone publication metadata, retains
the raw date label, and includes `publishedAt` in its extraction checklist. An
incomplete candidate is retried or replaced inside the adapter and is never
submitted to hard-threshold qualification.

## 11. Current Limits

- Publishing and engagement connectors are not registered yet.
- TikTok Discovery still uses AutoGLM as a share-link fallback; Xiaohongshu's
  current phone playbook is deterministic and does not require a vision model.
- A locked Android phone remains an explicit runtime failure. The Pipeline does
  not bypass device security or store the user's lock-screen password.
- Global trends, music trends, model training, and unattended auto-commenting are outside v0.1.

## 12. Researched Wheels

- MediaCrawler: useful extraction/search reference for Chinese platforms; non-commercial learning license.
- TikTok-Api: unofficial retrieval wrapper; not a publishing provider.
- twscrape: X search and GraphQL extraction.
- Instaloader: Instagram media and metadata retrieval.
- yt-dlp: media download worker.
- Patchright: Playwright-compatible browser backend candidate.
- PySceneDetect, WhisperX, PaddleOCR: visual evidence preprocessing.
- ComfyUI, Remotion, FFmpeg: generation and deterministic rendering.

CreatorHub, social-auto-upload, Postiz, and similar integrated systems are research references only. Their dashboards, databases, schedulers, and end-to-end workflow state are not imported into the core architecture.
