---
name: narration
description: Import a human narration recording, transcribe it locally with whisper.cpp when configured, and align it to the approved Videooo script.
---

# Narration

Use this skill after the user has explicitly approved a script and recorded the narration.

The human recording is the temporal source of truth. The approved script remains immutable.

## Import the recording

When the user provides or identifies an audio file, run:

```bash
videooo narration add <audio-file>
```

Then inspect:

```bash
videooo narration show
videooo status
```

Do not copy or rename audio manually inside `.videooo/`. The CLI preserves the original recording, hashes it, binds it to the approved script version, and advances the project to `recorded`.

## Preferred local transcription

Videooo M2 uses a local whisper.cpp adapter.

Prerequisites:

- `ffmpeg` on PATH, or `VIDEOOO_FFMPEG_BIN`;
- `whisper-cli` on PATH, or `VIDEOOO_WHISPER_CPP_BIN`;
- a whisper.cpp GGML model path supplied with `--model` or `VIDEOOO_WHISPER_CPP_MODEL`.

Run:

```bash
videooo align --provider whisper-cpp --model <model-path>
```

Optional:

```bash
videooo align \
  --provider whisper-cpp \
  --model <model-path> \
  --language zh
```

Videooo normalizes the source recording to 16 kHz mono PCM WAV before transcription.

Do not enable whisper.cpp VAD in M2. The adapter intentionally avoids VAD so token timestamps remain on the original audio timeline.

## Provider-neutral fallback

If local whisper.cpp is unavailable, do not fabricate transcript timestamps.

A canonical transcript from another trustworthy tool may be imported:

```bash
videooo transcript import <transcript.json>
videooo align --from-transcript
```

The transcript must include timed tokens and pass Videooo validation.

## Low coverage

Alignment normally requires at least 85% timed script-token coverage.

If alignment fails:

1. inspect `videooo alignment show`;
2. summarize meaningful insertions, deletions, and substitutions;
3. determine whether the recording materially differs from the approved script.

Do not automatically accept poor alignment.

Only when the user explicitly accepts the lower-confidence timing, run:

```bash
videooo align --from-transcript --accept-low-coverage
```

## After alignment

Report:

- duration;
- alignment coverage;
- number of deviations;
- important script/recording differences;
- section timing availability.

When state becomes `aligned`, stop at the M3 storyboard boundary unless later Videooo capabilities are installed.
