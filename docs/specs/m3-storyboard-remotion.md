# M3 — Storyboard, Scene IR, and Remotion First Render

Status: implementation target

## 1. Goal

M3 turns an aligned human narration timeline into a deterministic, renderable educational video.

The M3 pipeline is:

```text
aligned narration
  -> semantic storyboard
  -> validated Scene IR
  -> fixed Videooo design system
  -> Remotion composition
  -> 1080p draft render
  -> qa
```

M3 intentionally uses **Remotion only** for the first complete visual pipeline.

Manim remains a specialized renderer planned for M4.

## 2. Product promise

Once narration is aligned, the user should not manually edit a timeline.

The agent should decide:

- where visual scenes begin and end;
- what the viewer should understand in each scene;
- which visual treatment best supports that explanation;
- what text/code/diagram content appears;
- where visual state changes happen.

The deterministic runtime should decide:

- whether the storyboard is structurally valid;
- how millisecond timing maps to frames;
- how Scene IR is persisted;
- how the common design system is applied;
- how Remotion is bundled and rendered;
- where render outputs are written.

## 3. Architecture boundary

M3 must not generate a new Remotion project inside every video project.

The installed Videooo runtime owns one reusable Remotion implementation:

```text
Installed Videooo
  packages/renderer-remotion/
    component library
    design system
    Remotion root
    server renderer
            |
            v
Project .videooo/storyboard.json
Project .videooo/scenes/*.json
Project .videooo/narration/source.*
            |
            v
Project .videooo/renders/draft.mp4
```

The project remains data, narration, and assets.

## 4. Source of truth

By M3, the project has three distinct sources of truth:

- approved script: semantic wording;
- alignment: real narration timing;
- Scene IR: visual intention and scene content.

The renderer must not infer new teaching claims from narration.

The storyboard/Scene IR may simplify presentation but must preserve the approved script's meaning.

## 5. Storyboard artifact

Add:

```ts
interface StoryboardArtifact {
  schemaVersion: 1
  id: string
  projectId: string
  alignmentId: string
  createdAt: string
  video: VideoFormat
  scenes: StoryboardScene[]
}

interface VideoFormat {
  width: number
  height: number
  fps: number
}

interface StoryboardScene {
  id: string
  startMs: number
  endMs: number
  sectionIds: string[]
  teachingGoal: string
  visualKind: M3VisualKind
  direction: string
  content: SceneContent
  transition?: SceneTransition
}
```

Default format:

```json
{
  "width": 1920,
  "height": 1080,
  "fps": 30
}
```

## 6. M3 visual vocabulary

M3 supports five deterministic Remotion scene families:

```ts
type M3VisualKind =
  | 'title'
  | 'typography'
  | 'code'
  | 'diagram'
  | 'summary'
```

M3 does not claim to render every concept optimally.

If a scene genuinely requires equations, geometric transformations, scientific plotting, or complex algorithm animation, the storyboard should still describe the intent, but implementation waits for the M4 Manim router.

For M3 acceptance, every imported scene must use one of the five supported Remotion kinds.

## 7. Scene content

### 7.1 Title

```ts
interface TitleSceneContent {
  type: 'title'
  eyebrow?: string
  title: string
  subtitle?: string
}
```

Use for:

- opening hook;
- chapter reset;
- major conceptual shift.

### 7.2 Typography

```ts
interface TypographySceneContent {
  type: 'typography'
  headline: string
  body?: string
  emphasis?: string[]
}
```

Use for:

- one strong idea;
- concise definition;
- contrast;
- conceptual emphasis.

### 7.3 Code

```ts
interface CodeSceneContent {
  type: 'code'
  title?: string
  language?: string
  code: string
  highlightedLines?: number[]
  annotation?: string
}
```

M3 uses deterministic syntax-neutral code styling.

Syntax highlighting libraries may be added later.

### 7.4 Diagram

```ts
interface DiagramNode {
  id: string
  label: string
  x: number
  y: number
  emphasis?: boolean
}

interface DiagramEdge {
  from: string
  to: string
  label?: string
}

interface DiagramSceneContent {
  type: 'diagram'
  title?: string
  nodes: DiagramNode[]
  edges: DiagramEdge[]
}
```

Coordinates are normalized:

```text
x: 0..1
y: 0..1
```

The renderer maps normalized coordinates into the visual safe area.

M3 diagrams are intentionally simple: nodes, arrows, labels, emphasis.

### 7.5 Summary

```ts
interface SummarySceneContent {
  type: 'summary'
  title: string
  bullets: string[]
}
```

Use for recaps and takeaways.

## 8. Transition vocabulary

M3 supports:

```ts
type SceneTransition =
  | 'cut'
  | 'fade'
  | 'slide'
```

Default is `fade`.

The transition choice is semantic direction, not arbitrary animation code.

M3 must not let agents specify raw CSS easing values, React code, or per-frame keyframes.

## 9. Storyboard planning rules

The `storyboard` skill receives:

- approved ScriptVersion;
- NarrationAlignment;
- Research Pack where needed for factual grounding.

The agent segments by semantic beat.

### 9.1 Preferred boundaries

Prefer boundaries at:

1. script section boundaries;
2. narration pauses;
3. change in teaching goal;
4. example/result transitions;
5. natural visual reset points.

### 9.2 Avoid mechanical chunking

Do not split every fixed N seconds.

Do not create a new scene for every sentence.

Default pacing guidance:

- avoid scenes shorter than 2 seconds unless intentionally punchy;
- 4–12 seconds is a useful normal range;
- longer scenes are allowed when the visual meaning evolves without requiring a cut.

These are guidance, not validator hard limits.

### 9.3 Scene coverage

The storyboard must cover the complete narration timeline.

For M3:

- first scene starts at 0 ms;
- final scene ends at alignment `durationMs`;
- scenes are ordered;
- scenes do not overlap;
- scenes are contiguous;
- every scene duration is positive.

No black gaps should be created accidentally.

## 10. Storyboard validation

Deterministic validation must reject:

- wrong project ID;
- wrong alignment ID;
- unsupported video dimensions/fps;
- duplicate scene IDs;
- negative timestamps;
- zero/negative duration;
- scenes outside alignment duration;
- overlapping scenes;
- gaps between scenes;
- wrong first/last boundary;
- unknown section IDs;
- content type not matching `visualKind`;
- unsupported M3 visual kind;
- empty required text;
- invalid diagram coordinates;
- diagram edges targeting unknown nodes;
- duplicate diagram node IDs;
- invalid highlighted code line numbers.

The agent fixes validation errors.

The runtime does not silently normalize invalid storyboard structure.

## 11. Scene IR

M3 upgrades Scene IR from a loose future contract into the actual renderer contract.

```ts
interface SceneIR {
  schemaVersion: 1
  id: string
  projectId: string
  storyboardId: string
  startMs: number
  durationMs: number
  sectionIds: string[]
  teachingGoal: string
  renderer: 'remotion'
  visualKind: M3VisualKind
  content: SceneContent
  transition: SceneTransition
}
```

M3 removes the requirement for agents to generate low-level generic `objects/actions`.

The fixed Remotion component library interprets `content` and `transition`.

M4 may add renderer-specific extensions without changing M3 artifacts retroactively.

## 12. Storyboard compilation

New package:

```text
packages/storyboard/
```

Responsibilities:

- validate StoryboardArtifact;
- compile StoryboardScene -> SceneIR;
- map timing without changing milliseconds;
- provide deterministic scene filenames/order;
- calculate frame boundaries for a given FPS.

Persisted Scene IR remains in milliseconds.

Frame rounding happens only at render planning time.

## 13. Frame mapping

At 30 FPS:

```text
frame = round(ms / 1000 * fps)
```

But independent rounding can create gaps/overlaps.

Therefore render planning uses scene **boundaries**:

1. convert every scene boundary to a frame;
2. use the same rounded boundary as previous end / next start;
3. force first boundary to 0;
4. force final boundary to composition duration.

This guarantees contiguous frame coverage.

## 14. Project files

After storyboard compilation:

```text
.videooo/
  storyboard.json
  style.json
  scenes/
    scene_001.json
    scene_002.json
    ...
```

Add project manifest fields:

```ts
storyboardId?: string
styleId?: string
sceneCount?: number
renderId?: string
```

## 15. Design system

M3 ships a deterministic default design system.

Canonical artifact:

```ts
interface VideoStyle {
  schemaVersion: 1
  id: string
  background: string
  surface: string
  foreground: string
  muted: string
  accent: string
  accentSoft: string
  fontFamily: string
  monoFontFamily: string
  safeAreaPx: number
  radiusPx: number
}
```

The default should prioritize:

- strong hierarchy;
- high contrast;
- minimal decoration;
- generous safe areas;
- stable typography;
- restrained motion;
- consistent cards and code blocks.

M3 does not attempt arbitrary style generation.

Later versions can support style presets or extracted visual identity.

## 16. Remotion runtime

Upgrade:

```text
packages/renderer-remotion/
```

into the real renderer.

Pin exact matching Remotion package versions.

At M3 implementation time:

```text
remotion 4.0.532
@remotion/bundler 4.0.532
@remotion/renderer 4.0.532
@remotion/media 4.0.532
```

Remotion currently recommends keeping all `remotion` / `@remotion/*` versions exactly aligned.

React/React DOM are pinned to compatible exact versions as well.

## 17. Fixed component library

The runtime contains reusable components:

```text
VideoooComposition
SceneFrame
TitleScene
TypographyScene
CodeScene
DiagramScene
SummaryScene
NarrationAudio
```

Agents do not edit these components per video.

The component library is part of the installed Videooo version.

## 18. Common visual behavior

Every scene gets:

- common background;
- common safe area;
- shared typography scale;
- subtle entrance animation;
- optional exit transition;
- scene progress based on local Remotion frame;
- no animation driven by wall-clock time.

All motion must derive from Remotion's frame clock.

## 19. Narration audio in Remotion

The renderer copies the preserved narration source into a temporary/public render workspace owned by the current Videooo project.

The Remotion composition references it through `staticFile()`.

Use the current recommended audio component:

```text
<Audio /> from @remotion/media
```

The original narration file remains unchanged.

## 20. Server-side render path

M3 uses the stable Node server render flow:

```text
bundle()
  -> selectComposition()
  -> renderMedia()
```

The fixed Remotion entry point synchronously registers one main composition:

```text
VideoooMain
```

Input props are JSON-serializable and contain:

- compiled scenes;
- style tokens;
- video format;
- duration;
- narration public filename.

The Composition uses `calculateMetadata()` so duration and dimensions come from input props.

## 21. Output

Default output:

```text
.videooo/renders/draft.mp4
```

Default codec:

```text
H.264 / MP4
```

Default format:

```text
1920 x 1080
30 fps
```

CLI:

```bash
videooo render
videooo render --output /path/to/file.mp4
```

Rendering transitions:

```text
storyboarded
  -> rendering
  -> qa
```

A render failure leaves the project in `rendering`.

Successful render records a RenderManifest and advances to `qa`.

## 22. Render manifest

```ts
interface VideoRenderManifest {
  schemaVersion: 1
  id: string
  projectId: string
  storyboardId: string
  alignmentId: string
  createdAt: string
  renderer: 'remotion'
  outputPath: string
  width: number
  height: number
  fps: number
  durationMs: number
  codec: 'h264'
}
```

Canonical:

```text
.videooo/renders/render.json
```

## 23. CLI

M3 adds:

```text
videooo storyboard import <storyboard.json>
videooo storyboard show
videooo storyboard compile

videooo scenes list
videooo scenes show <scene-id>

videooo render
videooo render --output <file>
```

### Import

Requires state `aligned`.

Validates against the current alignment.

### Compile

- writes default `style.json` if none exists;
- writes deterministic Scene IR files;
- updates storyboard metadata;
- transitions `aligned -> storyboarded`.

### Render

Requires `storyboarded`.

- verifies compiled Scene IR and narration;
- transitions to `rendering`;
- renders MP4;
- persists render manifest;
- transitions to `qa`.

## 24. Codex workflow

Update `skills/storyboard/SKILL.md`.

### aligned

The agent:

1. reads approved script;
2. reads alignment;
3. optionally reads research for grounding;
4. creates StoryboardArtifact;
5. imports it;
6. fixes validator errors;
7. compiles it;
8. summarizes the planned scenes before rendering when useful;
9. runs `videooo render`.

No React/TSX source is generated per project.

### qa

M3 stops at the QA boundary.

M5 later adds automated visual review/regeneration.

For now Codex reports where the draft render was written.

## 25. Remotion Agent Skills

Videooo should not vendor copies of Remotion's official Agent Skills.

The official skills are maintained separately and can be installed for developers modifying the Videooo Remotion component library.

Current official skills include `remotion-best-practices`, `remotion-markup`, `remotion-render`, and `remotion-docs`.

Per-video Videooo users do not need those skills because their projects produce declarative Scene IR, not custom React code.

## 26. Render determinism

M3 renderer rules:

- no random values unless seeded from scene ID;
- no current date/time in frames;
- no network assets;
- no remote fonts;
- no CSS animation based on wall time;
- no layout dependency on host filesystem paths;
- narration and project assets are local.

A rerender with the same Videooo version and project artifacts should be visually equivalent.

## 27. Asset policy

M3 core visual types do not require external media.

Future image/video asset support should go through:

```text
.videooo/assets/
```

and explicit asset IDs.

The first M3 implementation should not introduce uncontrolled remote image fetching into Remotion.

## 28. Render workspace

Temporary Remotion/public assets live under:

```text
.videooo/render-workspace/
```

This directory is disposable and ignored by Git.

It may contain:

- narration copy;
- bundle cache;
- temporary render data.

The canonical project artifacts are outside this workspace.

## 29. CI

M3 CI has two layers.

### Baseline

`pnpm check` validates:

- storyboard contracts;
- compilation;
- frame planning;
- component types;
- renderer orchestration types;
- all existing tests.

### Real Remotion smoke

Add a separate smoke command/job that:

1. creates a tiny fixture project;
2. uses a 1-second silent WAV fixture;
3. creates two small scenes;
4. bundles the actual Remotion entry point;
5. selects the composition;
6. renders a short H.264 MP4;
7. verifies a non-empty output file.

The smoke render can use reduced dimensions for CI speed.

The production default remains 1920x1080.

## 30. Testing

### Storyboard validation

- exact alignment coverage;
- wrong alignment ID;
- gap;
- overlap;
- wrong first/last boundary;
- unsupported visual kind;
- unknown section;
- diagram invalid edge/node;
- content kind mismatch.

### Scene compilation

- deterministic filenames/order;
- millisecond preservation;
- frame boundaries contiguous;
- final frame equals composition duration.

### Component rendering

Unit-test pure layout helpers where useful.

### Render orchestration

- render props assembly;
- narration public filename;
- output manifest.

### Smoke

Real Remotion bundle/select/render succeeds.

## 31. PR plan

### PR A — M3 specification

This document only.

### PR B — Storyboard + Scene IR

- domain contracts;
- storyboard validator/compiler;
- default style;
- project-store persistence;
- CLI storyboard/scenes commands;
- storyboard skill;
- tests.

### PR C — Remotion runtime + first render

- pin Remotion runtime dependencies;
- implement five scene components;
- narration audio;
- server renderer;
- CLI render;
- render manifest;
- update Videooo orchestrator/README;
- real render smoke test.

## 32. Acceptance criteria

M3 is complete when an aligned project can run:

```bash
videooo storyboard import storyboard.json
videooo storyboard compile
videooo render
videooo status
```

and produces:

```text
.videooo/
  storyboard.json
  style.json
  scenes/
    scene_001.json
    ...
  renders/
    draft.mp4
    render.json
```

with:

- 1920x1080 / 30fps defaults;
- preserved human narration;
- full timeline coverage;
- deterministic Scene IR;
- real Remotion H.264 render;
- no per-project Node/Remotion installation;
- state advanced to `qa`;
- all CI checks green.
