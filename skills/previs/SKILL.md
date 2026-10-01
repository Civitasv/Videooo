---
name: previs
description: Create a silent Videooo preview from an approved script before narration exists, then promote the same visual plan onto real narration timing later.
---

# Previs

Use this skill when the Videooo project is in `approved` and the user wants to see the script and visuals before recording narration.

Previs is deliberately provisional:

- the approved script is real;
- the visuals are real;
- the timing is estimated;
- the main workflow stage remains `approved`.

Do not claim estimated timing is narration alignment.

## Create estimated timing

Run:

```bash
videooo previs create
videooo previs timing
```

If the user gave a specific target duration that differs from the project brief:

```bash
videooo previs create --target-seconds <seconds>
```

## Build the preview storyboard

Read:

- approved script;
- `.videooo/previs/timing.json`;
- research pack when factual grounding matters.

Use the same visual rules as the normal `storyboard` skill.

The JSON shape is:

```json
{
  "schemaVersion": 1,
  "id": "previs-storyboard-001",
  "projectId": "<project id>",
  "timingId": "<previs timing id>",
  "createdAt": "<ISO-8601>",
  "video": {
    "width": 1920,
    "height": 1080,
    "fps": 30
  },
  "scenes": []
}
```

Scene structure is the same as normal Videooo storyboard scenes:

- startMs/endMs;
- sectionIds;
- teachingGoal;
- visualKind;
- direction;
- content;
- optional transition.

The preview scenes must cover the entire estimated timeline with no gaps or overlaps.

## Import, compile, render

```bash
videooo previs storyboard import <storyboard.json>
videooo previs storyboard compile
videooo previs route show
videooo previs render
```

The default output is:

```text
.videooo/previs/renders/preview.mp4
```

It is intentionally silent.

If Manim scenes are present, Videooo renders them through the normal deterministic Manim worker.

## Iterate visuals

The preview storyboard may be re-imported and recompiled while the project remains `approved`.

Use this phase to improve:

- visual concept;
- scene density;
- renderer choice;
- diagrams;
- Manim scenes;
- overall pacing assumptions.

Do not modify the approved narration merely to fit the estimated preview timing.

## Later narration

When the user eventually records:

```bash
videooo narration add <audio-file>
videooo align --provider whisper-cpp ...
```

After the project reaches `aligned`, reuse the preview visual plan:

```bash
videooo previs promote
videooo storyboard compile
videooo render
```

`previs promote` retimes existing preview scene boundaries onto the real narration timeline. It does not redesign the scenes.

Only create a fresh production storyboard if the user explicitly wants a creative redesign instead of reusing Previs.
