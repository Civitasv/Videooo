---
name: research
description: Build and import a sourced M1 Research Pack for an educational video before script drafting.
---

# Research

Use this skill when a Videooo project is in the `research` phase.

## Workflow

1. Read `.videooo/project.json` and the project topic/brief.
2. Research the topic using current, authoritative sources.
3. Prefer primary sources for technical or factual claims.
4. Produce one JSON artifact matching the M1 `ResearchPack` contract.
5. Run `videooo research import <path>`.
6. If validation fails, repair the artifact rather than bypassing validation.

## Research rules

- Search before asserting time-sensitive, niche, or uncertain facts.
- Never invent a source, URL, title, publication date, or citation.
- Distinguish `fact`, `interpretation`, and `contested` claims.
- Every factual claim needs at least one source ID.
- Keep uncertainty explicit in `confidence`, `notes`, or `unresolved`.
- Identify definitions, examples, misconceptions, and visual opportunities useful for teaching.
- Do not write the final narration in this phase.
- Visual opportunities describe explanatory intent, not React/Manim implementation.

## Required JSON shape

```json
{
  "schemaVersion": 1,
  "id": "research-001",
  "projectId": "<project id>",
  "topic": "<exact project topic>",
  "createdAt": "<ISO-8601>",
  "questions": [],
  "sources": [
    {
      "id": "src-1",
      "title": "...",
      "url": "https://...",
      "accessedAt": "<ISO-8601>",
      "sourceType": "primary"
    }
  ],
  "claims": [
    {
      "id": "claim-1",
      "text": "...",
      "sourceIds": ["src-1"],
      "confidence": "high",
      "kind": "fact"
    }
  ],
  "definitions": [],
  "examples": [],
  "misconceptions": [],
  "visualOpportunities": [],
  "unresolved": []
}
```

Allowed `sourceType`: `primary`, `secondary`, `community`, `other`.

Allowed claim `kind`: `fact`, `interpretation`, `contested`.

Allowed visual `suggestedKind`: `diagram`, `equation`, `chart`, `concept-animation`, `code`, `comparison`.

The deterministic validator in Videooo is authoritative.
