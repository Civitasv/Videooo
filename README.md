# Videooo

Videooo is an AI-native production workflow for researched, human-narrated educational videos.

The human owns the explanation and voice. The system owns research assistance, script iteration, timing, visual direction, rendering, and QA.

## Product loop

```text
Topic
  -> Research Pack
  -> Draft Script
  -> Human + AI Review Loop
  -> Approved Script
  -> Human Narration
  -> Transcript / Alignment
  -> Storyboard + Scene IR
  -> Manim / Remotion
  -> Visual QA
  -> Final Video
```

The approval boundary is deliberate: Videooo must not render against a moving script. Once the script is approved and narration is recorded, the audio timeline becomes the source of truth for visual timing.

## Architecture

```text
domain + workflow + agent skills
            |
            v
       @videooo/core
            |
      +-----+------+
      |            |
      v            v
renderer-remotion renderer-manim
      |            |
      +-----+------+
            |
            v
       final timeline
```

The core is agent- and renderer-neutral. Agent Skills describe research, script, storyboard, and QA behavior. Renderers consume Scene IR.

## Repository layout

- `packages/domain` — canonical project, script, timing, and Scene IR contracts.
- `packages/workflow` — production state machine and invariants.
- `packages/core` — stable public facade.
- `packages/renderer-remotion` — Remotion adapter boundary.
- `packages/renderer-manim` — Manim adapter boundary.
- `apps/cli` — local project bootstrap CLI.
- `.agents/skills` — vendor-neutral production skills.
- `docs/specs/v1.md` — complete V1 product and technical specification.

## Development

Requires Node.js 22.20+ and pnpm 11.7+.

```bash
pnpm install
pnpm check
pnpm build
pnpm videooo init "Why does positional encoding matter?"
```

The init command creates `.videooo/project.json`.

Remotion owns the final compositor and timeline. Manim is a specialized renderer for mathematical, algorithmic, geometric, and scientific scenes.

## License

MIT
