# Architecture

Videooo separates deterministic production state from model-driven creative work.

## Layers

### Domain

Canonical persisted contracts: project manifest, research provenance, script versions, alignment, storyboard, Scene IR, render artifacts, and QA findings.

### Workflow

A deterministic state machine that decides which artifact gates must be satisfied before advancing. It does not call models, the web, or renderers.

### Agent Skills

Skills describe how an agent should research, write, revise, plan scenes, and review output. Different capable coding agents can execute the same repository skills without changing persisted project data.

### Renderers

Renderers consume Scene IR. Remotion is the final compositor. Manim generates specialized scene media that Remotion places on the final timeline.

## Source of truth by phase

| Phase | Source of truth |
| --- | --- |
| Research | Research Pack + cited claims |
| Script drafting | latest draft script version |
| Script approval | approved immutable script version |
| Recording | recorded human narration |
| Timing | aligned narration timestamps |
| Visual planning | Storyboard + Scene IR |
| Rendering | Scene IR + immutable assets |
| QA | rendered media + QA findings |

## Renderer boundary

The domain package exposes a `RendererAdapter` contract. Renderer-specific source code and toolchain details stay outside the domain model. A scene declares a preferred renderer, while the final global compositor remains Remotion.
