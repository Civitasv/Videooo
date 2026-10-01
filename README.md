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
       |\
       | \__ no recording yet
       |       -> Estimated timing
       |       -> Silent Previs preview.mp4
       |
       -> Human Narration
       -> Transcript / Alignment
       -> Reuse + retime Previs visual plan (when available)
       -> Storyboard + Scene IR
       -> Manim / Remotion
       -> Visual QA
       -> Final Video
```

The approval boundary is deliberate: Videooo never renders against a moving script. Previs can use an explicitly estimated timeline before narration exists, but real human narration remains the timing source of truth for final production.

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

M5.5 adds **Previs / Late Narration** to the completed V1 production loop.

You can now approve a script and see a real mixed Remotion/Manim preview before recording anything:

```text
Approved Script
  -> Estimated Timing
  -> Semantic Previs Storyboard
  -> Remotion / Manim
  -> silent preview.mp4
```

The main project stays in `approved`; Previs does not fake a narration alignment.

Later, when the real recording arrives:

```text
Human Narration
  -> Transcript / Alignment
  -> piecewise retime existing Previs storyboard
  -> production Scene IR
  -> render / QA
  -> final.mp4
```

Scene concepts, teaching goals, visual kinds, content, renderer choices, and transitions are reused. Only timing is remapped to the real narration unless you explicitly ask Codex for a creative redesign.

QA remains evidence-driven: Videooo owns structural checks and real frame extraction; Codex owns visual, semantic, and continuity review. Repairs remain non-destructive overlays.

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

# Optional: make a video before narration exists
videooo previs create
videooo previs timing
videooo previs storyboard import previs-storyboard.json
videooo previs storyboard compile
videooo previs route show
videooo previs render
# preview: .videooo/previs/renders/preview.mp4

# Later, record normally
videooo narration add narration.m4a
videooo narration show

videooo transcript import transcript.json
videooo transcript show

videooo align --provider whisper-cpp --model /path/to/model.bin
videooo align --from-transcript
videooo alignment show

# If Previs exists, reuse the same visual plan with real timing
videooo previs promote

# Otherwise import a fresh production storyboard
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

# when a structural blocker requires a fresh render:
videooo qa rerender
videooo render

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
- `packages/previs` — estimated script timing, silent preview storyboard validation, and late-narration retiming.
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
- `docs/specs/m5.5-previs-late-narration.md` — silent Previs and late-narration retiming specification.

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
