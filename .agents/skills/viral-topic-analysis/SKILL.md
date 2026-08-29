---
name: viral-topic-analysis
description: Analyze real viral source posts in Marketing Pipeline against the selected project's direction and assets, then save reviewable topic ideas, production-pattern breakdowns, pain points, and user feedback. Use for 爆帖分析、选题复刻、评论洞察、痛点提炼, or deciding whether a captured post is reusable; do not use to fabricate source evidence or publish content.
---

# Viral topic analysis

Turn captured evidence into editable, provenance-preserving planning records. Keep source facts, interpretation, topic selection, drafting, and publishing as separate stages.

## Workflow

1. Identify the selected project and source-post IDs. If either is ambiguous, inspect the local Control API or ask only for the missing selection.
2. Fetch each post's analysis context from `GET /api/v1/source-posts/:id/analysis-context`. Use its project direction, approved assets, metrics, matched Topic Watch, raw evidence, existing analysis, and stored comment evidence. Never infer a different project from the post's subject alone.
3. If comment evidence is important and absent, inspect `GET /api/v1/platforms`. Run `POST /api/v1/source-posts/:id/comment-runs` with the explicit `projectId`, bound `accountId`, and limit only when `capabilities.commentCollection` is true and the user requested collection. The bundled project does not include a Xiaohongshu comment bot; capability becomes true only after a real Bot service is configured. Treat login, risk-control, CAPTCHA, locked phones, and missing UI evidence as explicit blockers; do not invent comments.
4. Separate observed evidence from analysis. Mark unknown production details as unknown. Do not treat source media as reusable project media unless its license is recorded.
5. Produce the structured result in [references/analysis-schema.md](references/analysis-schema.md). Explain:
   - why the post likely performed well;
   - video production, article structure, and image treatment actually supported by evidence;
   - what can be adapted as a topic without copying protected expression;
   - relevant product/game pain points and authentic feedback, with source-comment IDs when available;
   - whether to reuse a project asset or generate a new, style-inspired asset.
6. Save the analysis with `PUT /api/v1/source-posts/:id/analysis`. Create topic candidates only from the saved analysis, using `POST /api/v1/ideas`; create pain-point, feedback, or inspiration entries with `POST /api/v1/insights`.
7. Leave every topic in human review. Do not approve it, create a draft, generate media, or publish unless the user separately requests that next transition.

## Quality boundaries

- Prefer a smaller set of distinct, project-relevant topics over padded variants.
- Preserve the source post ID and canonical URL on every derived topic.
- Label direct facts, comment-supported findings, and analyst inference distinctly.
- Quote comments only as short evidence snippets and do not expose handles unnecessarily.
- A strong topic may reuse a hook mechanism or narrative structure, not copied wording, frames, or source media.
- Video generation remains a reserved downstream slot. A video topic may include a production brief, but must not claim that a video artifact exists.
