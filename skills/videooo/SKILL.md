---
name: videooo
description: Orchestrate a Videooo educational-video project in the current working directory, from topic through research, collaborative script approval, and later production stages.
---

# Videooo

Use this skill when the user asks to create, start, continue, or inspect an educational-video project with Videooo.

Videooo is script-first and human-narrated for final production, but it can also create silent Previs before narration exists. The current implementation covers research, collaborative script approval, provisional preview timing, human narration alignment, mixed Remotion/Manim rendering, visual QA, scene-scoped repair, and final acceptance.

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

The script is locked.

Choose the path from the user's intent:

#### User is ready to record

- Tell the user which script version is approved.
- When the user provides or identifies the audio file, use the `narration` skill.
- Import it through `videooo narration add <file>`.

#### User has no recording yet or wants to see the video first

Use the `previs` skill.

Create estimated timing and a silent preview while keeping the project in `approved`:

```bash
videooo previs create
# create/import semantic preview storyboard
videooo previs storyboard compile
videooo previs render
```

Do not pretend the estimated timeline is real narration timing.

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

Report duration, coverage, significant deviations, and section timing.

If a Previs storyboard exists, reuse it instead of redesigning:

```bash
videooo previs promote
videooo storyboard compile
```

Then continue to render.

If no Previs storyboard exists, use the normal `storyboard` skill to create/import/compile the production storyboard.

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

Use the `video-qa` skill.

Prepare real frame evidence, inspect it, import a QA review, and either:

- accept a passing report; or
- create a scene-scoped repair overlay, rerender, and repeat.

Stop after at most three automatic repair rounds.

### done

The accepted video is `.videooo/renders/final.mp4`. Report the final path and the accepted QA status.

Follow the implemented capabilities available in the current Videooo version. Never fabricate missing milestone behavior.

## Invariants

- The human decides what they will say.
- Research claims preserve provenance.
- Script versions are append-only.
- Approval is explicit.
- Project mutations go through the CLI.
- One installed Videooo runtime may serve any number of independent working directories.
