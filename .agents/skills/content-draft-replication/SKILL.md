---
name: content-draft-replication
description: Turn approved Marketing Pipeline topic ideas into original, provenance-preserving review drafts and project-owned image assets. Use for 复刻选题、生成文案、生成配图、修改待审草稿, or regenerating draft images; do not copy source media, approve a draft, or publish it.
---

# Content draft replication

Create editable text and image work from approved topics while keeping human review and source provenance intact.

## Workflow

1. Resolve the selected project and the exact approved Idea IDs or ContentDraft IDs. Read `GET /api/v1/ideas?projectId=...`, `GET /api/v1/content-drafts?projectId=...`, and `GET /api/v1/assets?projectId=...`. Do not use an Idea whose status is not `approved`.
2. For a new draft, call `POST /api/v1/content-drafts` with the project and approved Idea ID. The server freezes the exact Idea revision, source posts, and PatternCard versions; do not recreate that provenance manually.
3. Read each frozen source post's analysis context. Reuse mechanisms such as information order, hook structure, or shot rhythm, but write original copy. Never reuse source wording, frames, screenshots, music, or illustrations unless a recorded license explicitly permits it.
4. Choose one explicit asset strategy:
   - `reuse_project_asset`: use only an available Asset from the same project whose `artifactId` is present;
   - `generate_style_similar`: generate an original image from the draft's `imageBrief`, using the source only for abstract composition or pacing cues;
   - `no_asset`: use only when the target format genuinely needs no media.
5. When generating a bitmap, use the available image-generation capability. Upload the resulting local file to `POST /api/v1/projects/:projectId/artifacts` as multipart field `file`. Then create a project Asset with `POST /api/v1/assets`, passing the returned `artifactId`, descriptive tags, and metadata that records the model/tool, prompt summary, and that the image is original. Never place secrets or source-post media in metadata.
6. Save the result as a new draft revision with `PATCH /api/v1/content-drafts/:id`. Include the original copy, `assetStrategy`, exact `assetIds`, `imageBrief`, and `createdBy: "codex-skill"`. Follow [references/draft-contract.md](references/draft-contract.md).
7. For video topics, save only a structured `videoBrief` with `status: "reserved"` until a real video Provider produces an Artifact. Do not claim a video exists.
8. Leave the draft in `pending_review`. Do not call the review, publication-draft, or execute endpoints unless the user separately asks for that transition after inspecting the result.

## Quality boundaries

- Ground the draft in the selected project's direction and owned assets, not just the source post's subject.
- Preserve source IDs and exact version snapshots; never replace them with URLs copied into free text.
- A generated image must be project-owned, original, and visibly distinguishable from the source asset.
- If image generation or upload fails, save an honest image brief without an asset ID and report the blocker. Do not attach a placeholder and label it complete.
- Produce a small number of meaningfully different drafts instead of padded variations.
