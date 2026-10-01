# M1 — Research and Collaborative Script Specification

Status: implementation target

## 1. Goal

M1 makes the first half of Videooo usable:

```text
Topic
  -> Research Pack
  -> Draft Script
  -> Human + AI Revision Loop
  -> Explicit Approval
```

At the end of M1, the project has one immutable approved script version that the user can record in M2.

M1 does **not** render video and does **not** synthesize speech.

## 2. Product boundary

The agent is responsible for:

- researching the topic;
- preserving source provenance;
- proposing a spoken draft;
- revising the script from user feedback;
- suggesting visual opportunities without implementing scenes.

The user is responsible for:

- deciding the topic and angle;
- reviewing the draft;
- giving editorial feedback;
- explicitly approving the final version.

The deterministic Videooo runtime is responsible for:

- validating artifacts;
- persisting project state;
- versioning scripts;
- enforcing provenance;
- enforcing workflow gates;
- recording which script version is approved.

No model provider is allowed to bypass these deterministic checks.

## 3. Why M1 is artifact-driven

Videooo should work with Codex, Claude Code, or another capable agent without binding its core to one model SDK.

Therefore M1 uses an artifact protocol:

```text
Agent Skill
   |
   v
research.json / script.json
   |
   v
Videooo validator
   |
   v
project store
```

The agent may create the artifact by web research, model inference, or a future provider adapter. Videooo only accepts it after validation.

This makes the repository:

- harness-neutral;
- testable without model credentials;
- reproducible;
- safe for CI;
- easy to automate later.

## 4. Project brief

A project may contain an optional brief in addition to the topic.

```ts
interface ProjectBrief {
  audience?: string
  targetDurationSeconds?: number
  angle?: string
  questions?: string[]
  sourceConstraints?: string[]
}
```

The brief is editorial input, not generated truth.

It is persisted in `.videooo/project.json`.

## 5. Research Pack

The canonical M1 Research Pack is:

```ts
interface ResearchPack {
  schemaVersion: 1
  id: string
  projectId: string
  topic: string
  createdAt: string
  questions: string[]
  sources: SourceRecord[]
  claims: ResearchClaim[]
  definitions: ResearchDefinition[]
  examples: ResearchExample[]
  misconceptions: ResearchMisconception[]
  visualOpportunities: VisualOpportunity[]
  unresolved: string[]
}
```

### 5.1 Sources

```ts
interface SourceRecord {
  id: string
  title: string
  url: string
  publisher?: string
  publishedAt?: string
  accessedAt: string
  sourceType: 'primary' | 'secondary' | 'community' | 'other'
}
```

Requirements:

- source IDs are unique;
- URLs must be absolute HTTP(S) URLs;
- `accessedAt` is required;
- primary/authoritative sources are preferred;
- community sources may supplement but should not be the sole provenance for high-confidence technical claims when better sources exist.

### 5.2 Claims

```ts
interface ResearchClaim {
  id: string
  text: string
  sourceIds: string[]
  confidence: 'high' | 'medium' | 'low'
  kind: 'fact' | 'interpretation' | 'contested'
  notes?: string
}
```

Requirements:

- claim IDs are unique;
- factual claims require at least one valid source ID;
- every source ID must exist in the same Research Pack;
- uncertainty must be represented explicitly;
- a contested claim must not be rewritten as an established fact.

### 5.3 Teaching support

Research is not only bibliography collection. It should also identify:

- definitions the audience needs;
- examples that expose the mechanism;
- common misconceptions;
- relationships worth visualizing;
- unresolved questions that should be omitted or qualified in the script.

A visual opportunity is explanatory intent only:

```ts
interface VisualOpportunity {
  id: string
  description: string
  relatedClaimIds: string[]
  suggestedKind?:
    | 'diagram'
    | 'equation'
    | 'chart'
    | 'concept-animation'
    | 'code'
    | 'comparison'
}
```

It must not contain renderer-specific implementation code.

## 6. Research validation

`validateResearchPack` is deterministic and runs before persistence.

Minimum errors:

- wrong schema version;
- wrong project ID;
- topic mismatch with the project;
- duplicate source/claim IDs;
- malformed source URL;
- unknown claim source reference;
- fact claim with no provenance;
- unknown visual-opportunity claim reference.

Warnings may include:

- no primary source;
- all claims low confidence;
- empty examples;
- unresolved items present.

M1 only blocks on errors.

## 7. Research persistence

Canonical paths:

```text
.videooo/
  project.json
  research.json
```

Import is atomic:

1. parse candidate JSON;
2. validate against the current project;
3. write a temporary file;
4. replace `research.json`;
5. update project metadata/state.

A validation failure must not partially update project state.

## 8. Research workflow

Initial project state:

```text
topic
```

When research work begins:

```text
topic -> research
```

After a valid Research Pack is accepted:

```text
research -> draft-script
```

A later research replacement after script drafting is intentionally **not** part of M1. Future work may support research revisions with dependent script invalidation.

## 9. Script model

A script is immutable content identified by a version ID.

```ts
interface ScriptVersion {
  schemaVersion: 1
  id: string
  projectId: string
  version: number
  parentVersionId?: string
  researchPackId: string
  createdAt: string
  changeSummary?: string
  sections: ScriptSection[]
}
```

Approval is **not** stored by mutating the script version.

The project manifest stores:

```ts
approvedScriptVersionId?: string
approvedScriptAt?: string
```

This preserves immutable script versions.

### 9.1 Script section

```ts
interface ScriptSection {
  id: string
  purpose: string
  narration: string
  researchClaimIds: string[]
  visualHints: string[]
}
```

Requirements:

- section IDs are unique within a version;
- narration cannot be blank;
- every research claim ID must exist in the current Research Pack;
- visual hints describe explanatory intention rather than Manim/Remotion implementation;
- section order is the spoken order.

## 10. Script versioning

First accepted draft:

```text
scripts/v001.json
```

First revision:

```text
scripts/v002.json
```

and so on.

Rules:

- versions are append-only;
- version numbers increase by exactly one;
- a revision points to the immediately previous version via `parentVersionId`;
- an existing version file is never overwritten;
- IDs must be unique;
- an approved version remains unchanged forever.

The latest version is not automatically approved.

## 11. Script drafting workflow

After valid research:

```text
draft-script
```

The agent uses the `script` skill and Research Pack to create version 1.

After Videooo accepts it:

```text
draft-script -> script-review
```

The user can now read and discuss the draft.

## 12. Revision loop

While in `script-review`, user feedback causes the agent to create a new full script version.

Conceptually:

```text
script-review
  -> revision generation
  -> script-review
```

The persisted project stays in `script-review` while revisions are imported. Revision generation is an activity, not a durable project phase.

Each revision includes `changeSummary`, for example:

```text
"Move intuition before the formula and replace the sorting analogy."
```

The full version is persisted; Videooo does not store patch-only scripts.

## 13. Explicit approval

Approval requires an explicit command or equivalent deterministic action:

```text
videooo script approve <version>
```

Preconditions:

- project is in `script-review`;
- requested script version exists;
- requested script belongs to the current project;
- its `researchPackId` matches current research;
- it passes script validation.

Effect:

- set `approvedScriptVersionId`;
- set `approvedScriptAt`;
- transition `script-review -> approved`.

No agent-generated text such as “this looks final” counts as approval.

## 14. Editing after approval

If the user wants to change narration after approval, Videooo must not mutate the approved file.

Future behavior:

```text
approved
  -> new draft version
  -> script-review
```

The existing workflow already permits returning from `approved` to drafting. M1 only guarantees immutable approved content; a polished post-approval revision command may be added later.

## 15. Project store

M1 adds a filesystem-backed project store package.

Responsibilities:

- locate `.videooo`;
- load/save project manifest;
- load/save Research Pack;
- list/load script versions;
- append script versions;
- perform atomic JSON writes;
- reject overwrites of versioned script files.

It contains filesystem side effects but no model or renderer dependencies.

Suggested package:

```text
packages/project-store/
```

## 16. Runtime validators

Runtime validators remain in the deterministic code path.

Suggested ownership:

- domain types: `packages/domain`;
- semantic validation: `packages/workflow`;
- filesystem persistence: `packages/project-store`.

M1 does not need a schema library if the contracts remain small; introducing one later is allowed if it materially improves maintainability.

## 17. CLI

M1 CLI surface:

```text
videooo init <topic>
videooo status

videooo research begin
videooo research import <research.json>
videooo research show

videooo script import <script.json>
videooo script list
videooo script show [version]
videooo script approve <version>
```

### 17.1 Why import commands exist

The first implementation deliberately separates agent generation from deterministic acceptance.

Example agent workflow:

```text
1. Agent reads .agents/skills/research/SKILL.md
2. Agent performs research
3. Agent writes /tmp/research.json
4. Agent runs:
   videooo research import /tmp/research.json
5. Agent reads .agents/skills/script/SKILL.md
6. Agent writes /tmp/script.json
7. Agent runs:
   videooo script import /tmp/script.json
8. Human discusses revisions
9. Agent imports v002, v003, ...
10. Human says "approve"
11. Agent runs:
    videooo script approve 3
```

Later a harness adapter may collapse these into higher-level commands such as `videooo research` without changing artifact contracts.

## 18. Status output

`videooo status` should show at least:

- project ID;
- topic;
- workflow stage;
- whether research exists;
- research pack ID;
- script version count;
- latest script version;
- approved script version, if any.

It must not require any network access.

## 19. Agent Skill updates

### Research skill

The skill must instruct the agent to:

- search before asserting time-sensitive or niche facts;
- preserve source URLs and access time;
- distinguish fact/interpretation/contested;
- avoid invented citations;
- produce exactly the Research Pack shape expected by M1;
- run the Videooo import command and repair validation errors.

### Script skill

The skill must instruct the agent to:

- use only supported claims for factual assertions;
- write spoken language;
- create full immutable versions;
- include parent version and change summary on revision;
- preserve visual hints as intent;
- never call approval unless the human explicitly approves.

## 20. Testing

M1 unit tests must cover:

### Research

- accepts a valid pack;
- rejects unknown source references;
- rejects fact claims without provenance;
- rejects topic/project mismatch;
- rejects duplicate IDs.

### Script

- accepts valid v001;
- rejects unknown research claim references;
- rejects duplicate section IDs;
- rejects invalid version sequence;
- rejects overwrite of an existing version.

### Approval

- cannot approve outside script review;
- cannot approve missing version;
- approving sets project approval metadata;
- approval never rewrites the script file.

### Store

- initializes paths;
- atomic JSON round-trip;
- lists script versions in order.

CLI integration tests may be added when command parsing becomes non-trivial.

## 21. CI

Baseline CI remains:

```text
skills check
-> typecheck
-> lint
-> tests
```

No research API keys or model credentials are required.

## 22. PR plan

### PR A — M1 specification

- this document;
- no runtime behavior change.

### PR B — Research Pack + project store

- extend domain contracts;
- add Research Pack validation;
- add `packages/project-store`;
- add `status`, `research begin/import/show`;
- update research skill;
- tests.

### PR C — Collaborative script + approval

- immutable ScriptVersion contract;
- script validation and sequential versioning;
- script persistence;
- `script import/list/show/approve`;
- update script skill;
- approval state transition;
- tests.

## 23. M1 acceptance criteria

M1 is complete when this workflow works without manually editing project JSON:

```bash
videooo init "Why does positional encoding matter?"
videooo research begin
videooo research import research.json
videooo script import script-v1.json
videooo script import script-v2.json
videooo script list
videooo script approve 2
videooo status
```

And the resulting project satisfies:

- `.videooo/research.json` has valid provenance;
- `.videooo/scripts/v001.json` and `v002.json` both remain present;
- v002 references v001 as parent;
- project state is `approved`;
- project manifest points to v002;
- neither script file was mutated during approval;
- all CI checks pass.
