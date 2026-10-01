# Videooo agent rules

## Product invariant

Videooo is script-first, human-narrated, and audio-synchronized.

Do not remove the explicit human approval boundary between draft script and production. Rendering starts only from an approved script plus recorded narration.

## Architecture rules

1. Keep `packages/domain` free of agent SDKs, model SDKs, Remotion, Manim, and network clients.
2. Keep `packages/workflow` deterministic and side-effect free.
3. Treat Scene IR as the renderer contract.
4. Remotion owns final composition and the global timeline.
5. Manim is a specialized scene renderer, not the final timeline owner.
6. Store persisted time as integer milliseconds.
7. Research claims must preserve source provenance.
8. An approved script is immutable. Text revision creates a new version and returns to script review.
9. Agent behavior belongs in `.agents/skills`; deterministic reusable behavior belongs in code.
10. Tests and baseline CI must not require API keys or live model calls.

Run `pnpm check` before opening a PR.
