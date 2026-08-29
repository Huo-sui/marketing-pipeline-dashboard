# Draft and asset API contract

The local base URL is normally `http://127.0.0.1:3210/api/v1`.

Create a frozen draft from an approved Idea:

```json
{
  "projectId": "<project-uuid>",
  "ideaId": "<approved-idea-uuid>",
  "createdBy": "codex-skill"
}
```

Upload an original image as multipart field `file` to
`POST /projects/:projectId/artifacts`. Keep the returned `id` as `artifactId`.

Register it as a project Asset:

```json
{
  "projectId": "<project-uuid>",
  "artifactId": "<artifact-uuid>",
  "name": "Original draft image",
  "type": "生成图",
  "usage": "Review draft illustration",
  "tags": ["generated", "draft"],
  "metadata": {
    "origin": "generated-original",
    "provider": "<tool-or-model>",
    "promptSummary": "<non-sensitive summary>"
  }
}
```

Save a new draft revision:

```json
{
  "projectId": "<project-uuid>",
  "title": "Original title",
  "copy": "Original body copy",
  "format": "图文",
  "assetStrategy": "generate_style_similar",
  "assetIds": ["<asset-uuid>"],
  "imageBrief": "What the image communicates and how it differs from the source",
  "videoBrief": null,
  "createdBy": "codex-skill"
}
```

The server creates the next version. Do not send `status: approved` and do not
call publication endpoints from this workflow.
