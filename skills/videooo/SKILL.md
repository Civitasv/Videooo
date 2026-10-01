---
name: videooo
description: Orchestrate a Videooo educational-video project in the current working directory, from topic through research, collaborative script approval, and later production stages.
---

# Videooo

Use this skill when the user asks to create, start, continue, or inspect an educational-video project with Videooo.

Videooo is script-first, human-narrated, and audio-synchronized. The current implementation covers topic -> research -> collaborative script -> explicit approval.

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

The script is locked for narration. M2 narration import/alignment is not implemented yet. Report that the user can now record the approved narration and that Videooo currently stops at this milestone boundary.

### recorded / aligned / storyboarded / rendering / qa / done

Follow the implemented capabilities available in the current Videooo version. Never fabricate missing milestone behavior.

## Invariants

- The human decides what they will say.
- Research claims preserve provenance.
- Script versions are append-only.
- Approval is explicit.
- Project mutations go through the CLI.
- One installed Videooo runtime may serve any number of independent working directories.
