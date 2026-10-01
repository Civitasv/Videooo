---
name: video-qa
description: Review Videooo render evidence with vision, import scene-scoped findings, and repair only failing visual scenes until QA passes.
---

# Video QA

Use this skill when a Videooo project is in the `qa` stage.

The runtime owns structural checks and evidence extraction. You own visual, semantic, and continuity judgment.

Do not invent structural findings, suppress runtime findings, rewrite approved narration, or manually edit base Scene IR.

## Automatic loop

Run at most **three** automatic repair iterations.

### 1. Prepare evidence

```bash
videooo qa prepare
videooo qa evidence
```

Read `.videooo/qa/<run-id>/evidence.json`.

Each scene contains:

- teaching goal;
- relevant approved narration;
- renderer and visual kind;
- scene timing;
- sampled frame filenames.

Inspect the actual images under:

```text
.videooo/qa/<run-id>/frames/
```

Do not claim to have visually reviewed a frame you did not inspect.

### 2. Review

For each scene inspect available 10%, 50%, and 90% samples.

Check:

#### Visual

- overflow or clipping;
- illegible type;
- low contrast;
- collisions;
- excessive density;
- broken Manim scale/crop;
- unintended blank frames;
- awkward unused space.

#### Semantic

Compare frame + narration + teaching goal.

Flag when:

- the visual contradicts the narration;
- the visual is decorative rather than explanatory;
- the wrong concept is emphasized;
- a diagram relationship is misleading;
- a plot/equation/algorithm state does not teach the spoken point;
- the visual introduces an unsupported claim.

#### Continuity

Compare adjacent scenes, especially late samples from one scene and early samples from the next.

Flag:

- unexplained scale jumps;
- inconsistent hierarchy/alignment;
- jarring visual-language changes;
- transitions that obscure content.

## Review artifact

Create a JSON review containing **only** visual, semantic, and continuity findings:

```json
{
  "schemaVersion": 1,
  "id": "review-001",
  "projectId": "<project id>",
  "evidenceId": "run-001",
  "createdAt": "<ISO-8601>",
  "findings": [
    {
      "id": "visual-001",
      "sceneId": "scene-003",
      "severity": "error",
      "category": "visual",
      "message": "The diagram labels overlap at the center.",
      "evidenceFrameIds": ["scene-003:0500"],
      "repairHint": "Separate the nodes and shorten the labels."
    }
  ]
}
```

Use:

- `error` for defects that should block acceptance;
- `warning` for optional improvements;
- `info` sparingly.

Import:

```bash
videooo qa import <review.json>
videooo qa report
```

Runtime structural findings are automatically merged into the final report.

## If QA passes

Run:

```bash
videooo qa accept
```

This advances the project to `done` and creates:

```text
.videooo/renders/final.mp4
```

## If QA fails

First inspect blocking findings.

### Structural error

Do **not** create a visual repair overlay for structural errors.

Fix the actual prerequisite or project/render issue, then prepare evidence again or rerender as appropriate.

### Visual / semantic / continuity error

Create the smallest scene-scoped repair.

A repair may change only:

- visual kind;
- scene content;
- transition;
- visual direction metadata.

It may **not** change:

- scene ID;
- timing;
- section IDs;
- teaching goal;
- narration;
- approved script.

Example:

```json
{
  "schemaVersion": 1,
  "id": "repair-001",
  "projectId": "<project id>",
  "qaReportId": "<latest report id>",
  "createdAt": "<ISO-8601>",
  "sceneRepairs": [
    {
      "sceneId": "scene-003",
      "findingIds": ["visual-001"],
      "visualKind": "diagram",
      "content": {
        "type": "diagram",
        "nodes": [],
        "edges": []
      },
      "transition": "fade"
    }
  ]
}
```

The example content must be replaced with a valid useful scene, not empty placeholders.

Import and rerender:

```bash
videooo qa repair import <repair.json>
videooo render
```

Then repeat from `videooo qa prepare`.

Unchanged Manim scenes keep their cache. A changed Manim scene gets a new cache key automatically.

## Loop limit

After three failed automatic repair rounds, stop.

Report:

- remaining blocking findings;
- affected scene IDs;
- what repairs were attempted;
- whether the remaining issue is visual, semantic, continuity, structural, or environment-related.

Do not silently continue an unbounded generation loop.
