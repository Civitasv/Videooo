# Videooo

Videooo is an AI-native workflow for researched, human-narrated educational videos.

The human owns the explanation and voice. Videooo helps research the topic, iterate on the narration script, direct the visuals, render scenes, and run QA.

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

The approval boundary is deliberate: Videooo does not render against a moving script. Once the script is approved and narration is recorded, the audio timeline becomes the source of truth for visual timing.

## Use Videooo from Codex

Videooo is packaged as a Codex-compatible Agent Plugin. Install the plugin once, install the deterministic CLI once, then create each video in its own ordinary folder.

### One-time local developer setup

Clone Videooo and link the CLI:

```bash
git clone https://github.com/Civitasv/Videooo.git
cd Videooo
pnpm install
pnpm install:cli
```

Verify:

```bash
videooo --version
```

If pnpm reports that its global bin directory is not configured, run `pnpm setup`, restart the shell, and rerun `pnpm install:cli`.

### One-time local narration setup

M2 uses local whisper.cpp by default. On macOS with Homebrew:

```bash
brew install ffmpeg whisper.cpp
```

Download a GGML whisper.cpp model from the official model collection, then either pass it per command:

```bash
videooo align --provider whisper-cpp --model /path/to/ggml-model.bin
```

or configure it once for your shell:

```bash
export VIDEOOO_WHISPER_CPP_MODEL=/path/to/ggml-model.bin
```

Optional binary overrides:

```bash
export VIDEOOO_WHISPER_CPP_BIN=/path/to/whisper-cli
export VIDEOOO_FFMPEG_BIN=/path/to/ffmpeg
```

The default M2 path is local-only: narration audio is not uploaded to a cloud transcription service.

### Optional Manim setup

M4 uses Manim Community for equation, plot, vector, and algorithm scenes. On macOS, the simplest current installation is:

```bash
brew install manim
manim --version
```

Videooo M4 expects Manim 0.21.x. You can override the executable with:

```bash
export VIDEOOO_MANIM_BIN=/path/to/manim
```

Equation scenes currently use Manim `MathTex`, so install a LaTeX distribution (for example MacTeX on macOS) if you want equation rendering. Plot/vector/algorithm scenes do not require LaTeX.

If a project contains only Remotion-routed scenes, Manim is not required.

Add the Videooo marketplace to Codex:

```bash
codex plugin marketplace add Civitasv/Videooo --ref master
```

Then install/enable **Videooo** from the supported local Plugins Directory/marketplace surface. The repository contains both the portable `plugin.json` and the Codex compatibility manifest.

### Create a video project anywhere

A video project does not need to be a Node project and does not need its own Videooo dependencies.

```bash
mkdir -p ~/Videos/attention
cd ~/Videos/attention
codex
```

Then ask Codex, for example:

```text
Use Videooo to make an educational video about why positional encoding matters.
The audience understands basic neural networks. Aim for about eight minutes.
```

Videooo stores project state in the current working directory:

```text
~/Videos/attention/
  .videooo/
    project.json
    research.json
    scripts/
    narration/
    scenes/
    assets/
    renders/
```

A second folder gets a completely independent project:

```text
~/Videos/diffusion/.videooo/
~/Videos/gradient-descent/.videooo/
```

The installed plugin, CLI, skills, and future renderers are shared. They are not copied into each video project.

## Current milestone

M5 closes the V1 production loop:

```text
Topic
  -> Research Pack
  -> Collaborative approved script
  -> Human narration
  -> Transcript / forced alignment
  -> Semantic storyboard
  -> Visual Router
      -> Remotion
      -> Manim
  -> H.264 draft.mp4
  -> deterministic QA evidence
  -> Codex visual / semantic / continuity review
  -> scene-scoped repair overlays
  -> rerender only what changed
  -> accepted final.mp4
```

QA is evidence-driven rather than score-driven. Videooo extracts real frames from the rendered video and owns structural checks; Codex inspects those frames and submits scene-scoped findings.

Repairs are non-destructive overlays. The approved script, narration, alignment, original storyboard, and base Scene IR remain unchanged. Changed Manim scenes invalidate only their own cache key.

The automatic QA loop is capped at three repair rounds before remaining blockers are surfaced to the user.

## CLI

The deterministic CLI is responsible for project mutations and validation:

```bash
videooo --version
videooo --help

videooo init "Why does positional encoding matter?"
videooo status

videooo research begin
videooo research import research.json
videooo research show

videooo script import script-v1.json
videooo script list
videooo script show 1
videooo script approve 1

videooo narration add narration.m4a
videooo narration show

videooo transcript import transcript.json
videooo transcript show

videooo align --provider whisper-cpp --model /path/to/model.bin
videooo align --from-transcript
videooo alignment show

videooo storyboard import storyboard.json
videooo storyboard show
videooo storyboard compile
videooo scenes list
videooo route show

videooo manim check
videooo manim render-all

videooo render
# automatically renders missing Manim scenes
# default: .videooo/renders/draft.mp4

videooo qa prepare
videooo qa evidence
videooo qa import review.json
videooo qa report

# when blocking visual findings exist:
videooo qa repair import repair.json
videooo render

# when the report passes:
videooo qa accept
# final: .videooo/renders/final.mp4
```

Codex normally calls these commands through Videooo skills. You can also use them directly.

## Architecture

```text
                  Codex
                    |
                    v
            Videooo Agent Plugin
                    |
       +------------+------------+
       |            |            |
    research      script     storyboard / QA
       |            |            |
       +------------+------------+
                    |
                    v
               videooo CLI
                    |
                    v
          current cwd/.videooo/
                    |
                    v
              Videooo Core
               /        \
              v          v
           Remotion    Manim
```

Remotion owns the final composition and global timeline. Manim is a specialized renderer for mathematical, algorithmic, geometric, and scientific scenes.

## Repository layout

- `plugin.json` — portable Agent Plugin manifest.
- `.codex-plugin/plugin.json` — Codex compatibility metadata.
- `skills/` — packaged, vendor-neutral production skills.
- `apps/cli` — deterministic CLI.
- `packages/domain` — canonical project, script, narration, timing, and Scene IR contracts.
- `packages/alignment` — deterministic script/audio forced alignment.
- `packages/transcription` — provider-neutral transcription contract.
- `packages/transcriber-whisper-cpp` — local whisper.cpp + ffmpeg adapter.
- `packages/workflow` — production state machine and validators.
- `packages/project-store` — filesystem project persistence.
- `packages/core` — stable public facade.
- `packages/storyboard` — semantic storyboard validation, mixed Scene IR compilation, and frame planning.
- `packages/visual-router` — deterministic Remotion/Manim routing.
- `packages/manim-worker` — fixed-template Manim source generation, local rendering, and cache keys.
- `packages/qa` — deterministic QA evidence, report merging, and non-destructive repair overlays.
- `packages/renderer-remotion` — fixed Remotion component library and real H.264 renderer.
- `packages/renderer-manim` — Manim renderer capability marker.
- `docs/specs/v1.md` — full V1 product specification.
- `docs/specs/m1.5-codex-distribution.md` — Codex distribution specification.
- `docs/specs/m2-narration-alignment.md` — human narration and alignment specification.
- `docs/specs/m3-storyboard-remotion.md` — storyboard, Scene IR, and first-render specification.
- `docs/specs/m4-manim-router.md` — mixed Remotion/Manim routing specification.
- `docs/specs/m5-visual-qa.md` — visual QA and scene-scoped repair specification.

## Development

Requires Node.js 22.20+ and pnpm 11.7+.

```bash
pnpm install
pnpm check
pnpm build
```

Baseline CI requires no API keys or model credentials.

## License

MIT
