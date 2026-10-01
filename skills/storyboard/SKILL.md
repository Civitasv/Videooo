---
name: storyboard
description: Turn aligned narration into a semantic mixed-renderer Videooo storyboard, routing simple educational layouts to Remotion and mathematical or spatial transformations to Manim.
---

# Storyboard

Use this skill when a Videooo project is in the `aligned` stage.

## Goal

Choose the visual representation that best helps the viewer understand the current narration. Do not illustrate every noun and do not create a new scene on a fixed timer.

Read:

- `.videooo/project.json`
- the approved script version
- `.videooo/narration/alignment.json`
- `.videooo/research.json` when factual grounding is needed

## Scene boundaries

Prefer section boundaries, detected pauses, teaching-goal changes, example transitions, and natural visual resets.

The storyboard must cover the full narration exactly:

- first scene starts at 0 ms;
- scenes are contiguous and non-overlapping;
- final scene ends at `alignment.durationMs`.

## Visual vocabulary

### Remotion-routed

Use these for layout-driven explanations:

- `title` — opening/chapter reset
- `typography` — one strong idea or definition
- `code` — focused code excerpt
- `diagram` — simple nodes/arrows/labels
- `summary` — concise recap

### Manim-routed

Use these only when motion or spatial transformation materially improves understanding:

- `equation` — symbolic steps/transformation
- `plot` — changing or explanatory mathematical/scientific plots
- `vector` — coordinates, vectors, geometric direction
- `algorithm` — explicit state-by-state algorithm evolution

Do not choose Manim merely because the subject is technical.

The renderer is chosen deterministically by Videooo after import. Do not add a renderer field to the storyboard.

## Manim content shapes

### equation

```json
{
  "type": "equation",
  "title": "Solve for x",
  "steps": ["x+1=2", "x=1"],
  "annotations": ["Subtract 1 from both sides"]
}
```

### plot

```json
{
  "type": "plot",
  "title": "Loss decreases",
  "xLabel": "step",
  "yLabel": "loss",
  "xRange": [0, 10],
  "yRange": [0, 1],
  "series": [
    {
      "id": "loss",
      "points": [[0, 1], [5, 0.4], [10, 0.15]]
    }
  ]
}
```

### vector

```json
{
  "type": "vector",
  "title": "Gradient direction",
  "vectors": [
    {
      "id": "g",
      "label": "g",
      "from": [0, 0],
      "to": [2, 1]
    }
  ],
  "xRange": [-3, 3],
  "yRange": [-2, 2]
}
```

### algorithm

```json
{
  "type": "algorithm",
  "title": "One pass",
  "states": [
    {
      "label": "start",
      "values": ["4", "1", "3"],
      "activeIndices": [0, 1]
    },
    {
      "label": "swap",
      "values": ["1", "4", "3"],
      "activeIndices": [1, 2]
    }
  ]
}
```

## Workflow

1. Create one complete storyboard JSON.
2. Run `videooo storyboard import <storyboard.json>`.
3. Repair all validator errors.
4. Run `videooo storyboard compile`.
5. Inspect `videooo route show`.
6. If Manim scenes exist and local Manim is available, `videooo render` handles them automatically.

Do not generate per-project React, TSX, or arbitrary Python. Videooo owns both renderer implementations.
