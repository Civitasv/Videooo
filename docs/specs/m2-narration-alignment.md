# M2 — Human Narration, Transcription, and Alignment

Status: implementation target

## 1. Goal

M2 turns the approved narration script into an audio-synchronized timeline that later visual generation can trust.

The user still owns the voice:

```text
approved script
  -> user records narration
  -> narration import
  -> local transcription
  -> deterministic script/audio alignment
  -> word/phrase timing + deviations
  -> aligned
```

M2 does not generate speech and does not render video.

## 2. Product promise

After the script is approved, the user should only need to record it and give Videooo the audio file.

Videooo should then know:

- what was actually spoken;
- when each spoken unit occurred;
- where the recording differs from the approved script;
- how confident the alignment is;
- where meaningful pauses occur;
- which script ranges can safely drive storyboard timing.

The output becomes the timing source of truth for M3.

## 3. Design principles

### 3.1 Human narration is authoritative timing

The approved script remains the semantic source of truth.

The recording becomes the temporal source of truth.

If the user says a sentence slightly differently, Videooo records the deviation rather than silently changing the approved script.

### 3.2 Keep raw transcription separate from forced alignment

M2 persists two different artifacts:

```text
audio
  -> transcript.json
  -> alignment.json
```

`transcript.json` says what the transcription provider heard.

`alignment.json` maps the approved script onto the recording timeline.

This separation lets future providers change without changing project semantics.

### 3.3 Local-first transcription

The first built-in provider is `whisper.cpp`.

Reasons:

- narration does not need to leave the user's machine;
- Videooo remains usable without a cloud account;
- one installed runtime can serve many projects;
- word/token timing is available in full JSON output.

The provider is optional and replaceable.

### 3.4 Provider-neutral core

Domain/workflow/project-store packages must not know how whisper.cpp works.

Transcribers implement a provider contract and return canonical Videooo transcript data.

### 3.5 No VAD in the first whisper.cpp adapter

M2 must not enable whisper.cpp VAD.

As of the M2 design date, whisper-cli has a known issue where token timestamps in full JSON can remain on the VAD-compressed timeline while segment timestamps are mapped back to original audio.

Videooo prefers a slower but internally consistent timeline over a faster wrong one.

## 4. Workflow states

Existing durable states remain:

```text
approved
  -> recorded
  -> aligned
```

Rules:

- `narration add` requires `approved`;
- successful narration import moves the project to `recorded`;
- transcription alone does not move the project to `aligned`;
- only a validated alignment artifact moves `recorded -> aligned`.

A failed transcription/alignment attempt leaves the project in `recorded`.

## 5. Narration asset

Canonical metadata:

```ts
interface NarrationAsset {
  schemaVersion: 1
  id: string
  projectId: string
  scriptVersionId: string
  importedAt: string
  sourceFileName: string
  storedFileName: string
  sha256: string
  byteLength: number
  mediaType?: string
}
```

Canonical project paths:

```text
.videooo/
  narration/
    narration.json
    source.<ext>
    normalized.wav
    transcript.json
    alignment.json
```

`normalized.wav` is generated only when a transcriber needs it.

The original audio is preserved unchanged.

## 6. Narration import

CLI:

```bash
videooo narration add <audio-file>
videooo narration show
```

Import behavior:

1. require project state `approved`;
2. load the approved script version;
3. verify source file exists and is a regular file;
4. compute SHA-256 and byte length;
5. copy the source into `.videooo/narration/`;
6. write `narration.json`;
7. set `narrationId` on the project manifest;
8. transition `approved -> recorded`.

M2 does not allow replacing narration after import.

A future re-record workflow may invalidate downstream alignment explicitly.

## 7. Transcription artifact

Canonical transcript:

```ts
interface TranscriptArtifact {
  schemaVersion: 1
  id: string
  projectId: string
  narrationId: string
  createdAt: string
  provider: string
  model?: string
  language?: string
  durationMs: number
  text: string
  segments: TranscriptSegment[]
  tokens: TranscriptToken[]
}

interface TranscriptSegment {
  id: string
  startMs: number
  endMs: number
  text: string
}

interface TranscriptToken {
  id: string
  startMs: number
  endMs: number
  text: string
  confidence?: number
}
```

The canonical name is `tokens`, not `words`, because multilingual ASR engines may expose subword or character-like timed units.

M3 may derive human-readable word/phrase ranges from these tokens.

## 8. Transcriber contract

New package:

```text
packages/transcription/
```

Public interface:

```ts
interface TranscriptionRequest {
  audioPath: string
  projectId: string
  narrationId: string
  language?: string
}

interface Transcriber {
  readonly id: string
  transcribe(request: TranscriptionRequest): Promise<TranscriptArtifact>
}
```

The domain contract stays provider-neutral.

## 9. whisper.cpp provider

New package:

```text
packages/transcriber-whisper-cpp/
```

CLI surface:

```bash
videooo align \
  --provider whisper-cpp \
  --model /path/to/ggml-model.bin

videooo align \
  --provider whisper-cpp \
  --model /path/to/ggml-model.bin \
  --language zh
```

Configuration precedence:

1. CLI flags;
2. `VIDEOOO_WHISPER_CPP_BIN`;
3. `whisper-cli` on PATH.

Model precedence:

1. `--model`;
2. `VIDEOOO_WHISPER_CPP_MODEL`.

If the binary or model is missing, fail with an actionable message.

## 10. Audio normalization

The whisper.cpp adapter needs a stable input format.

Before transcription:

```text
source audio
  -> ffmpeg
  -> 16 kHz mono PCM s16le WAV
  -> normalized.wav
```

ffmpeg resolution:

1. `VIDEOOO_FFMPEG_BIN`;
2. `ffmpeg` on PATH.

M2 does not auto-install ffmpeg or change shell configuration.

If ffmpeg is absent, the provider reports the missing prerequisite.

## 11. whisper.cpp invocation

The adapter uses `whisper-cli` and requests full JSON with token timestamps.

Conceptual command:

```bash
whisper-cli \
  -m <model> \
  -f <normalized.wav> \
  -ojf \
  -of <output-base> \
  -l <language>
```

Constraints:

- do not enable VAD;
- do not enable translation;
- preserve the original spoken language;
- use no temporary path inside the source Videooo checkout;
- place temporary provider files under the current project's narration temp area;
- parse offsets as milliseconds;
- ignore special/non-speech tokens in canonical transcript tokens;
- require monotonic non-negative timestamps.

If whisper.cpp changes its JSON shape, fail validation rather than silently producing wrong timing.

## 12. Forced alignment

Raw ASR tokens are not the final storyboard timing.

M2 aligns the approved script to the transcript using deterministic sequence alignment.

New package:

```text
packages/alignment/
```

Inputs:

- approved ScriptVersion;
- TranscriptArtifact.

Outputs:

- canonical script tokens;
- mapped timing;
- deviations;
- coverage metrics.

## 13. Script tokenization

Script sections are flattened in spoken order.

Canonical script token:

```ts
interface ScriptToken {
  id: string
  sectionId: string
  index: number
  text: string
  normalized: string
}
```

Tokenization should use `Intl.Segmenter` where available with word granularity.

Fallback behavior must remain deterministic.

Punctuation-only units do not require audio timing but may remain attached to neighboring text for display.

Normalization may:

- lowercase where meaningful;
- normalize Unicode;
- collapse apostrophe variants;
- trim punctuation for comparison;
- collapse whitespace.

Normalization must never rewrite persisted approved narration text.

## 14. Sequence alignment

Use a deterministic dynamic-programming sequence aligner.

Allowed operations:

- match;
- normalized match;
- substitution;
- deletion from script;
- insertion in speech.

The cost model should prefer exact/normalized matches and avoid cascading errors from one missed word.

Transcript token timing is transferred onto matched/substituted script tokens.

For script tokens without direct timing:

- interpolate only between nearby matched anchors within the same section when safe;
- otherwise leave timing null;
- never invent timestamps outside transcript bounds.

## 15. Alignment artifact

Canonical artifact:

```ts
interface NarrationAlignment {
  schemaVersion: 1
  id: string
  projectId: string
  narrationId: string
  scriptVersionId: string
  transcriptId: string
  createdAt: string
  durationMs: number
  coverage: number
  scriptTokens: AlignedScriptToken[]
  deviations: ScriptDeviation[]
  pauses: NarrationPause[]
  sections: AlignedSection[]
}
```

### 15.1 Aligned token

```ts
interface AlignedScriptToken {
  id: string
  sectionId: string
  index: number
  text: string
  normalized: string
  startMs?: number
  endMs?: number
  transcriptTokenIds: string[]
  status:
    | 'exact'
    | 'normalized'
    | 'substituted'
    | 'missing'
    | 'interpolated'
}
```

### 15.2 Deviations

```ts
interface ScriptDeviation {
  id: string
  kind: 'insertion' | 'deletion' | 'substitution'
  sectionId?: string
  scriptText?: string
  spokenText?: string
  startMs?: number
  endMs?: number
}
```

Deviation reporting is diagnostic. It never mutates the approved script.

### 15.3 Pauses

```ts
interface NarrationPause {
  startMs: number
  endMs: number
  durationMs: number
}
```

M2 records pauses above a configurable default threshold of 350 ms between timed transcript units.

M3 can use these as natural visual cut/change opportunities.

### 15.4 Section timing

```ts
interface AlignedSection {
  sectionId: string
  startMs?: number
  endMs?: number
  coverage: number
}
```

These ranges are especially important for storyboard planning.

## 16. Alignment quality gate

`videooo align` computes coverage:

```text
timed script tokens / comparable script tokens
```

Default acceptance threshold:

```text
0.85
```

If coverage is below threshold:

- persist transcript;
- persist a diagnostic alignment candidate;
- do not transition the project to `aligned`;
- exit non-zero with a summary of major deviations.

Override:

```bash
videooo align --accept-low-coverage
```

The override must be explicit.

The final artifact records whether low coverage was explicitly accepted.

## 17. Manual/provider-neutral transcript import

M2 must not make whisper.cpp the only path.

CLI:

```bash
videooo transcript import <transcript.json>
videooo transcript show
videooo align --from-transcript
```

This allows:

- future cloud providers;
- WhisperX/faster-whisper;
- external transcription tools;
- test fixtures;
- manual repair.

The transcript validator is provider-neutral.

## 18. Project manifest additions

Add optional fields:

```ts
narrationId?: string
transcriptId?: string
alignmentId?: string
```

State is still the authoritative lifecycle indicator.

## 19. Project-store behavior

Add:

```text
narrationDirectory
narrationMetadataPath
narrationSourcePath
normalizedNarrationPath
transcriptPath
alignmentPath
```

Store APIs:

- save/load narration;
- copy narration source atomically enough to avoid manifest pointing to a missing file;
- save/load transcript;
- save/load alignment;
- reject accidental overwrite in M2.

The original source audio must never be modified.

## 20. CLI

M2 surface:

```text
videooo narration add <file>
videooo narration show

videooo transcript import <json>
videooo transcript show

videooo align --from-transcript
videooo align --provider whisper-cpp --model <model>
videooo alignment show
```

`videooo status` adds:

- narration ID;
- transcript ID;
- alignment ID;
- narration imported yes/no;
- transcript available yes/no;
- alignment coverage when available.

## 21. Codex skill behavior

Add:

```text
skills/narration/SKILL.md
```

Update the `videooo` orchestrator.

### approved

Tell the user the approved script is ready to record.

When the user provides or identifies an audio file:

```bash
videooo narration add <file>
```

### recorded

Prefer:

```bash
videooo align --provider whisper-cpp ...
```

when whisper.cpp/ffmpeg/model are configured.

If the local provider is unavailable, do not fake alignment. Explain the missing prerequisite or use a user-provided canonical transcript JSON.

### aligned

Report:

- total duration;
- coverage;
- number of deviations;
- important deviations;
- section timing availability.

Then M2 stops at the M3 storyboard boundary.

## 22. Privacy

M2 local default sends no narration audio to any cloud API.

Videooo must not upload narration unless a future cloud provider is explicitly configured and invoked.

Narration files remain inside the user's video project.

## 23. Tests

### Narration import

- requires approved project;
- copies audio into project narration directory;
- records SHA-256/byte length;
- binds narration to approved script;
- transitions to recorded;
- rejects replacement.

### Transcript validation

- rejects negative/non-monotonic timestamps;
- rejects wrong project/narration ID;
- rejects tokens outside duration;
- accepts valid multilingual token text.

### Alignment

- exact script/recording;
- punctuation/case differences;
- insertion;
- deletion;
- substitution;
- repeated words;
- multilingual text;
- interpolation between anchors;
- pause detection;
- coverage calculation.

### State gate

- failed low coverage does not move to aligned;
- accepted valid alignment moves recorded -> aligned;
- explicit low-coverage override is recorded.

### whisper.cpp adapter

Unit-test command construction and JSON parsing with fixtures.

CI does not require whisper-cli, ffmpeg, a model download, audio network access, or model inference.

## 24. PR plan

### PR A — M2 specification

This document only.

### PR B — narration + canonical transcript/alignment

- domain contracts;
- project-store narration/transcript/alignment paths;
- narration import;
- transcript validation/import;
- deterministic alignment package;
- CLI commands;
- tests.

### PR C — local whisper.cpp provider + Codex workflow

- transcription provider contract;
- whisper.cpp adapter;
- ffmpeg normalization;
- provider CLI integration;
- narration skill;
- orchestrator updates;
- README setup/docs;
- parser/command tests.

## 25. Acceptance criteria

M2 is complete when this sequence works:

```bash
videooo status
videooo narration add narration.m4a
videooo align --provider whisper-cpp --model /path/to/model.bin
videooo alignment show
videooo status
```

And the project contains:

```text
.videooo/
  narration/
    narration.json
    source.m4a
    normalized.wav
    transcript.json
    alignment.json
```

with:

- original narration preserved;
- transcript timing monotonic;
- approved script unchanged;
- alignment tied to the approved script;
- deviations reported;
- section timing available;
- project state `aligned` only after the alignment quality gate passes;
- no cloud upload in the default path;
- all CI checks green.
