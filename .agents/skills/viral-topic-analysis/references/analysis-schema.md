# Analysis result contract

Submit one JSON object per source post:

```json
{
  "summary": "One-sentence evidence-grounded assessment",
  "viralReasons": [
    { "claim": "Why it performed", "evidence": ["metric or source fact"], "confidence": "high|medium|low" }
  ],
  "production": {
    "mediaType": "video|image_text|text",
    "hook": "Opening mechanism or unknown",
    "structure": ["Ordered content beats"],
    "videoMethod": ["Shots, pacing, captions, audio, demonstrations, or unknown"],
    "writingMethod": ["Headline, body, proof, CTA, or unknown"],
    "imageTypes": ["Screenshot, UI capture, comparison, illustration, photo, typography, or unknown"]
  },
  "replicationDecision": {
    "verdict": "adapt|inspire|reject",
    "reason": "Project-specific reason",
    "portableElements": ["Reusable mechanisms"],
    "mustReplace": ["Source-specific or protected expression"]
  },
  "topicCandidates": [
    {
      "title": "Editable topic title",
      "hook": "Original project-specific hook",
      "format": "视频|图文|纯文本",
      "copyOutline": ["Outline beats"],
      "assetStrategy": "reuse_project_asset|generate_style_similar|no_asset",
      "assetIds": [],
      "imageBrief": "New-image brief when generation is needed",
      "videoPlaceholder": "Reserved production brief; no generated-video claim"
    }
  ],
  "insights": [
    {
      "kind": "inspiration|pain_point|feedback",
      "title": "Short label",
      "detail": "Finding",
      "evidenceType": "post|comment|inference",
      "commentIds": []
    }
  ],
  "limitations": ["Missing evidence and unverified behavior"]
}
```

Rules:

- `topicCandidates` may be empty when the post is off-direction or not safely adaptable.
- `assetIds` may contain only assets returned by the analysis-context endpoint.
- `commentIds` may contain only stored comment records.
- Use `unknown` or a limitation instead of filling an evidence gap.
- The Control API versions the saved analysis; never overwrite provenance in place.
