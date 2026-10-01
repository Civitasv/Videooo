---
name: storyboard
description: Turn an aligned Videooo narration into a complete semantic storyboard and deterministic Remotion Scene IR.
---

# Storyboard

Use this skill when a Videooo project is in the `aligned` stage.

## Goal

Direct visuals that help the viewer understand the narration. Do not mechanically illustrate every noun and do not split on a fixed timer.

Read:

- `.videooo/project.json`
- approved script version
- `.videooo/narration/alignment.json`
- `.videooo/research.json` when factual grounding is needed

## Scene boundaries

Prefer:

1. approved script section boundaries;
2. detected narration pauses;
3. changes in teaching goal;
4. transitions into or out of an example;
5. natural visual reset points.

Avoid scenes shorter than about 2 seconds unless intentionally punchy. A 4–12 second scene is a useful normal range, not a hard rule.

The storyboard must cover the complete narration timeline with no gaps or overlaps:

- first scene starts at 0ms;
- each next scene starts exactly when the previous scene ends;
- final scene ends exactly at alignment.durationMs.

## M3 visual vocabulary

M3 supports only:

- `title`
- `typography`
- `code`
- `diagram`
- `summary`

If a concept truly needs a mathematical/scientific animation that these cannot express, keep the M3 visual simple. Manim routing belongs to M4.

## Storyboard shape

Create one JSON artifact:

```json
{
  "schemaVersion": 1,
  "id": "storyboard-001",
  "projectId": "<project id>",
  "alignmentId": "<alignment id>",
  "createdAt": "<ISO-8601>",
  "video": {
    "width": 1920,
    "height": 1080,
    "fps": 30
  },
  "scenes": []
}
```

Each scene contains:

```json
{
  "id": "scene-001",
  "startMs": 0,
  "endMs": 6200,
  "sectionIds": ["hook"],
  "teachingGoal": "Make the viewer notice the missing order signal.",
  "visualKind": "title",
  "direction": "Open on the core question, then reveal the short answer.",
  "content": {
    "type": "title",
    "eyebrow": "Transformer intuition",
    "title": "Attention knows relationships. But does it know order?",
    "subtitle": "Not by itself."
  },
  "transition": "fade"
}
```

`content.type` must equal `visualKind`.

## Content guidance

### title

Use sparingly for opening/chapter resets.

### typography

One strong idea. Keep on-screen copy much shorter than narration.

### code

Show only the code needed to explain the current point. `highlightedLines` uses 1-based line numbers.

### diagram

Use simple normalized node positions (x/y from 0 to 1), arrows, and labels. Prefer 2–6 nodes over dense graphs.

### summary

Use a small number of concise takeaways.

## Workflow

1. Create the storyboard JSON in a temporary/project scratch location.
2. Run:
   `videooo storyboard import <storyboard.json>`
3. Repair validation errors; never bypass them.
4. Run:
   `videooo storyboard compile`
5. Inspect:
   `videooo scenes list`
6. If useful, inspect individual scenes with:
   `videooo scenes show <scene-id>`

After compilation the project is `storyboarded`. The fixed Videooo Remotion renderer, not the agent, is responsible for React markup and final composition.

Do not generate per-project React/TSX in M3.
