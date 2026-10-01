---
name: videooo
description: Orchestrate a Videooo educational-video project in the current working directory, from topic through research, collaborative script approval, and later production stages.
---

# Videooo

Use this skill when the user asks to create, start, continue, or inspect an educational-video project with Videooo.

Videooo is script-first, human-narrated, and audio-synchronized. The current implementation covers research, collaborative script approval, human narration alignment, semantic storyboard planning, mixed Remotion/Manim rendering, and a draft-video QA boundary.

## Runtime boundary

Project data belongs to the current working directory:

```text
<cwd>/.videooo/
```

Never create project state inside the installed Videooo plugin or Videooo source checkout unless that directory is itself the user's chosen video project.

Before any project mutation, verify that the deterministic CLI is available:

```bash
videooo --version
```

If the command is unavailable, do not manually edit `.videooo/project.json`, `research.json`, or versioned scripts to bypass validation. Tell the user that the one-time Videooo CLI installation is required.

## Start or resume

1. Check whether `.videooo/project.json` exists in the current working directory.
2. If it exists, run `videooo status` and resume from the returned stage.
3. If it does not exist, infer the topic from the user's request. If no usable topic is present, ask for the topic.
4. Initialize with `videooo init "<topic>"`.
5. Run `videooo research begin`.

Do not ask the user to create a Git repository, npm package, or Node project. A Videooo project is just the working folder plus `.videooo/` and media assets.

## Route by stage

### topic

Run:

```bash
videooo research begin
```

Then continue with the research workflow.

### research

Use the `research` skill. Produce a valid Research Pack, import it with the Videooo CLI, and repair validation failures rather than bypassing them.

### draft-script

Use the `script` skill to create and import script v001.

### script-review

This is a human collaboration gate.

- Read the latest script.
- Discuss the actual narration with the user.
- Treat user feedback as editorial authority.
- For changes, use the `script` skill to create and import a new immutable full version.
- Do not approve a version because it seems ready.

When the user explicitly says the current/specified version is final, approved, or otherwise clearly authorizes approval, identify that version and run:

```bash
videooo script approve <version>
```

### approved

The script is locked for narration.

- Tell the user which script version is approved and ready to record.
- The user records it with their preferred microphone/recording app.
- When the user provides or identifies the audio file, use the `narration` skill.
- Import the audio through `videooo narration add <file>`; never copy it manually into project state.

### recorded

Use the `narration` skill.

Prefer the local whisper.cpp path when ffmpeg, whisper-cli, and a model are configured:

```bash
videooo align --provider whisper-cpp --model <model-path>
```

If local transcription is not configured, report the missing prerequisite or use a user-provided canonical timed transcript. Never fabricate timestamps.

If alignment coverage is below the quality gate, discuss the deviations with the user. Do not use `--accept-low-coverage` unless the user explicitly accepts that tradeoff.

### aligned

Run `videooo status` and, when useful, `videooo alignment show`.

Report duration, coverage, significant deviations, and section timing. Then use the `storyboard` skill to create, import, and compile the M3 storyboard.

### storyboarded

The Scene IR is compiled and already contains deterministic renderer routing.

Inspect when useful:

```bash
videooo route show
```

Then render:

```bash
videooo render
```

Videooo automatically renders/caches required Manim scenes and then composes the complete timeline in Remotion. Do not generate a separate React app or arbitrary Manim Python.

### rendering

A previous render started but did not reach QA. Inspect the error and rerun `videooo render` after fixing the prerequisite or renderer issue.

### qa

A draft MP4 exists. Report the output from `videooo status` / project render metadata. Automated visual QA and scene regeneration belong to M5; do not pretend they have run.

### done

Follow the implemented capabilities available in the current Videooo version. Never fabricate missing milestone behavior.

## Invariants

- The human decides what they will say.
- Research claims preserve provenance.
- Script versions are append-only.
- Approval is explicit.
- Project mutations go through the CLI.
- One installed Videooo runtime may serve any number of independent working directories.
