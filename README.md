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

M1 is implemented:

```text
Topic
  -> Research Pack
  -> Draft Script
  -> Human + AI revisions
  -> Explicit approved script
```

The main Codex entry point is the packaged `videooo` skill. It reads `videooo status` and routes the current project to the focused `research` or `script` skill.

When the project reaches `approved`, the current implementation stops at the M2 boundary: record the narration next.

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
- `packages/domain` — canonical project, script, timing, and Scene IR contracts.
- `packages/workflow` — production state machine and validators.
- `packages/project-store` — filesystem project persistence.
- `packages/core` — stable public facade.
- `packages/renderer-remotion` — Remotion adapter boundary.
- `packages/renderer-manim` — Manim adapter boundary.
- `docs/specs/v1.md` — full V1 product specification.
- `docs/specs/m1.5-codex-distribution.md` — Codex distribution specification.

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
