---
name: video-qa
description: Review rendered educational-video evidence and produce scene-scoped repair findings.
---

# Video QA

Review four layers:

- Structural: timing bounds, missing assets, failed renders, invalid ranges.
- Visual: overflow, clipping, occlusion, contrast, caption collisions, empty frames, density.
- Semantic: whether visuals actually support narration and the teaching goal.
- Continuity: abrupt scale, style, alignment, or transition changes.

Output findings with scene ID, severity, category, and actionable message. Repair failed scenes only, then re-compose and run QA again.
