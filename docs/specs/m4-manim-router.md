# M4 — Visual Router and Manim Scene Worker

Status: implementation target

## 1. Goal

M4 adds a second visual renderer without changing the M3 project model.

```text
Storyboard
  -> Visual Router
      -> Remotion scene
      -> Manim scene
  -> rendered scene media
  -> Remotion final composition
```

Remotion remains the sole owner of the final timeline, narration audio, transitions, and final export. Manim renders only specialized scene clips.

## 2. Why Manim

Use Manim when the teaching value depends on spatial or mathematical transformation rather than layout:

- equations and symbolic transformations;
- vectors and coordinate systems;
- mathematical plots;
- graph/state transitions;
- algorithm steps;
- scientific concept animations.

Do not route ordinary titles, typography, summaries, code cards, or simple node diagrams to Manim.

## 3. Runtime version

M4 targets Manim Community v0.21.x.

The default supported version is v0.21.0. Manim is an external local runtime, not embedded Python code in the Videooo npm workspace.

Manim v0.21 supports deterministic seeds and explicit media/output configuration. Transparent output is available, but M4 defaults to opaque scene clips for simpler composition.

## 4. Project architecture

```text
Installed Videooo
  packages/manim-worker/
  packages/visual-router/
  packages/renderer-remotion/
       |
       v
Project .videooo/
  storyboard.json
  scenes/
  manim/
    specs/
    generated/
    media/
  renders/
    scenes/
    draft.mp4
```

No Python package is installed into each video project.

## 5. Storyboard visual vocabulary

Extend visual kinds with:

```ts
type M4VisualKind =
  | M3VisualKind
  | 'equation'
  | 'plot'
  | 'vector'
  | 'algorithm'
```

Routing defaults:

| Visual kind | Renderer |
| --- | --- |
| title | remotion |
| typography | remotion |
| code | remotion |
| diagram | remotion |
| summary | remotion |
| equation | manim |
| plot | manim |
| vector | manim |
| algorithm | manim |

The router is deterministic and can later accept explicit overrides.

## 6. Manim content contracts

### Equation

```ts
interface EquationSceneContent {
  type: 'equation'
  title?: string
  steps: string[]
  annotations?: string[]
}
```

Each step is a mathematical expression. M4 displays and transforms between steps.

### Plot

```ts
interface PlotSeries {
  id: string
  label?: string
  points: Array<[number, number]>
}

interface PlotSceneContent {
  type: 'plot'
  title?: string
  xLabel?: string
  yLabel?: string
  xRange: [number, number]
  yRange: [number, number]
  series: PlotSeries[]
}
```

M4 uses explicit point arrays rather than arbitrary executable functions.

### Vector

```ts
interface VectorItem {
  id: string
  label?: string
  from: [number, number]
  to: [number, number]
}

interface VectorSceneContent {
  type: 'vector'
  title?: string
  vectors: VectorItem[]
  xRange?: [number, number]
  yRange?: [number, number]
}
```

### Algorithm

```ts
interface AlgorithmState {
  label: string
  values: string[]
  activeIndices?: number[]
}

interface AlgorithmSceneContent {
  type: 'algorithm'
  title?: string
  states: AlgorithmState[]
}
```

M4 intentionally avoids arbitrary Python supplied by the agent.

## 7. Visual Router

New package:

```text
packages/visual-router/
```

Responsibilities:

- validate that a visual kind is supported;
- choose `remotion` or `manim`;
- compile StoryboardScene into renderer-tagged Scene IR;
- expose routing as a pure deterministic function.

M4 Scene IR:

```ts
interface SceneIR {
  ...
  renderer: 'remotion' | 'manim'
  visualKind: M4VisualKind
  content: SceneContent
}
```

## 8. Manim worker

New package:

```text
packages/manim-worker/
```

The Node worker:

1. accepts one Manim Scene IR;
2. writes a deterministic JSON spec;
3. writes deterministic generated Python source from fixed Videooo templates;
4. invokes the local `manim` executable;
5. verifies a non-empty video result;
6. returns the rendered asset metadata.

The coding agent never writes arbitrary Python into the project.

## 9. External runtime discovery

Resolution precedence:

1. CLI `--manim-bin`;
2. `VIDEOOO_MANIM_BIN`;
3. `manim` on PATH.

Version check:

```bash
manim --version
```

M4 accepts 0.21.x by default.

If unavailable or incompatible, fail with an actionable message.

## 10. Manim rendering

Conceptual command:

```bash
manim render \
  --renderer cairo \
  --format mp4 \
  --media_dir <project manim media dir> \
  --output_file <scene-id> \
  --seed <stable seed> \
  <generated.py> VideoooScene
```

The worker sets deterministic resolution and frame rate matching the Videooo project format.

No preview/player flag is used.

## 11. Deterministic code generation

Generated Python is owned by Videooo.

For each supported kind, the generator emits only approved Manim constructs.

Examples:

- equation: MathTex/TypstMath + TransformMatchingTex-like transforms;
- plot: Axes + VMobject/polyline/labels;
- vector: Axes + Arrow + labels;
- algorithm: arrays/cards with Transform/FadeIn emphasis.

M4 does not support arbitrary imports, filesystem access, shell calls, network access, or user Python snippets.

## 12. Duration control

Each Manim scene receives the target scene duration from Scene IR.

The generated scene distributes animation time across its steps/states, then waits for any remaining duration.

Rendered media duration must be close to the requested duration.

Allowed tolerance:

```text
max(150 ms, one video frame)
```

If the clip exceeds tolerance, the worker fails instead of silently desynchronizing the final timeline.

## 13. Output

Canonical scene render path:

```text
.videooo/renders/scenes/<scene-id>.mp4
```

Canonical metadata:

```ts
interface SceneRenderAsset {
  schemaVersion: 1
  sceneId: string
  renderer: 'manim'
  fileName: string
  durationMs: number
  width: number
  height: number
  fps: number
}
```

Persist:

```text
.videooo/renders/scenes/index.json
```

## 14. Final Remotion composition

M4 upgrades the shared Remotion renderer so a Manim Scene IR renders as embedded media.

For a Manim scene:

```tsx
<Video src={staticFile(...)} />
```

using `Video` from `@remotion/media`, which is the current recommended video component.

Manim clip audio is disabled/absent. Human narration remains the single global audio track.

Manim media is copied into the disposable Remotion public workspace before bundle/render.

## 15. Render orchestration

`videooo render` becomes:

```text
load Scene IR
  -> render every stale/missing Manim scene
  -> collect scene assets
  -> copy narration + Manim assets into Remotion public workspace
  -> bundle/selectComposition/renderMedia
  -> draft.mp4
```

Remotion scenes do not need pre-rendering.

## 16. Cache / stale detection

A Manim scene render key is derived from:

- Scene IR JSON;
- Videooo Manim template version;
- Manim version;
- video width/height/fps.

If the key matches an existing scene render asset, reuse it.

M4 may initially use a SHA-256 JSON hash.

## 17. CLI

Add:

```text
videooo route show

videooo manim check
videooo manim render <scene-id>
videooo manim render-all

videooo render [--manim-bin <path>]
```

`render` automatically renders missing Manim scenes.

## 18. Storyboard skill

The storyboard skill may now choose:

- `equation`
- `plot`
- `vector`
- `algorithm`

Guidance:

Use Manim only when motion or spatial transformation materially helps explanation.

Do not route to Manim merely because a scene contains numbers or technical language.

## 19. Videooo orchestrator

At `aligned`, storyboard generation can produce mixed renderer scenes.

At `storyboarded`, `videooo render` handles the renderer mix automatically.

The user should not manually invoke Manim during normal workflow.

## 20. Installation

Videooo remains a Node/Codex plugin.

Manim is an optional external prerequisite for projects that contain Manim-routed scenes.

README documents:

```bash
python -m pip install "manim==0.21.0"
manim --version
```

Platform-specific system dependencies remain governed by official Manim installation instructions.

No silent Python/model/system-package installation is performed by Videooo.

## 21. CI

Baseline CI must not require Manim for all jobs.

Add a dedicated Manim smoke job that:

1. installs Manim 0.21.0 and required Ubuntu system packages;
2. generates one short equation/vector scene;
3. invokes the real Manim CLI;
4. verifies a non-empty MP4;
5. runs the real final Remotion render using that generated Manim clip.

This proves the mixed-renderer path.

## 22. Testing

### Router

- M3 kinds route to Remotion;
- equation/plot/vector/algorithm route to Manim;
- unknown kind rejected.

### Manim generator

- deterministic source for same Scene IR;
- no arbitrary agent code;
- correct resolution/fps/duration;
- stable seed;
- valid expressions/data escaping.

### Cache

- same input reuses output;
- changed Scene IR invalidates cache.

### Remotion

- mixed Scene IR copies and embeds Manim media;
- global narration remains the only audio;
- frame planning remains contiguous.

### Real smoke

- Manim outputs a real clip;
- Remotion embeds it;
- final H.264 output is non-empty.

## 23. PR plan

### PR A — M4 specification

This document.

### PR B — Visual Router + Manim worker

- domain contracts;
- deterministic router;
- Manim content validation;
- deterministic Python generator;
- local Manim CLI worker;
- scene asset persistence/cache;
- CLI manim commands;
- unit tests.

### PR C — Mixed final composition

- Remotion Manim-video embedding;
- render orchestration;
- storyboard/orchestrator updates;
- README;
- real Manim + Remotion smoke CI.

## 24. Acceptance criteria

M4 is complete when a mixed project can contain:

```text
scene 1 -> Remotion title
scene 2 -> Manim equation
scene 3 -> Manim plot
scene 4 -> Remotion summary
```

and:

```bash
videooo render
```

automatically produces:

```text
.videooo/renders/scenes/scene-002.mp4
.videooo/renders/scenes/scene-003.mp4
.videooo/renders/draft.mp4
```

with:

- deterministic routing;
- no per-project Python environment;
- no arbitrary agent-generated Python;
- Manim v0.21.x external runtime;
- human narration preserved globally;
- mixed renderer timeline synchronized;
- real Manim + Remotion CI smoke green.
