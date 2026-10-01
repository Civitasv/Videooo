---
name: script
description: Draft, revise, import, and explicitly approve immutable spoken educational script versions.
---

# Script

Use this skill when a Videooo project is in `draft-script` or `script-review`.

## Goal

Help the human arrive at narration they actually want to say.

The human is the editorial authority. The agent proposes and revises; Videooo stores immutable versions; approval happens only after an explicit human decision.

## Before drafting

Read:

- `.videooo/project.json`;
- `.videooo/research.json`;
- the latest script version when revising.

Do not invent factual claims unsupported by the current Research Pack.

## Writing rules

- Write for speech, not for an essay.
- Prefer one clear idea per sentence.
- Build intuition before formal detail when that improves comprehension.
- Keep transitions natural and remove filler.
- Preserve nuance for contested or uncertain claims.
- Attach `researchClaimIds` to sections containing factual assertions.
- Keep `visualHints` at the level of explanatory intent, not React/Manim code.

## Immutable artifact shape

First draft:

```json
{
  "schemaVersion": 1,
  "id": "script-001",
  "projectId": "<project id>",
  "version": 1,
  "researchPackId": "<research pack id>",
  "createdAt": "<ISO-8601>",
  "sections": [
    {
      "id": "hook",
      "purpose": "...",
      "narration": "...",
      "researchClaimIds": ["claim-1"],
      "visualHints": ["..."]
    }
  ]
}
```

A revision is a complete new version with `parentVersionId` and `changeSummary`.

Never overwrite an earlier version. Do not store mutable approval state in the script artifact.

## Draft/revision loop

1. Create the full candidate JSON.
2. Run `videooo script import <path>`.
3. Show or summarize the version to the human.
4. Discuss feedback.
5. Create the next full version.
6. Import it and repeat.

Use `videooo script list` and `videooo script show [version]` to inspect history.

## Approval gate

Never run approval merely because the agent thinks the script is ready.

Only after explicit human approval, run:

```bash
videooo script approve <version>
```

Approval updates the project manifest and does not mutate the script file.
