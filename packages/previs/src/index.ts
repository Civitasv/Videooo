import type {
  EstimatedTiming,
  NarrationAlignment,
  PrevisStoryboardArtifact,
  SceneIR,
  ScriptVersion,
  StoryboardArtifact,
  VideoProjectManifest,
} from '@videooo/domain'
import {
  compileStoryboard,
  parseStoryboardArtifact,
} from '@videooo/storyboard'

const LATIN_WORD_MS = 360
const CJK_CHARACTER_MS = 220
const COMMA_PAUSE_MS = 120
const SENTENCE_PAUSE_MS = 260
const NEWLINE_PAUSE_MS = 350
const MIN_SECTION_MS = 1500

export interface EstimateTimingOptions {
  id?: string
  createdAt?: string
  targetDurationMs?: number
}

export function estimateScriptTiming(
  project: VideoProjectManifest,
  script: ScriptVersion,
  options: EstimateTimingOptions = {},
): EstimatedTiming {
  if (script.projectId !== project.id) {
    throw new Error('Approved script belongs to another project')
  }
  if (project.approvedScriptVersionId !== script.id) {
    throw new Error('Previs timing requires the approved script version')
  }
  if (script.sections.length === 0) {
    throw new Error('Approved script has no sections')
  }

  const targetDurationMs =
    options.targetDurationMs ??
    (project.brief?.targetDurationSeconds === undefined
      ? undefined
      : Math.round(project.brief.targetDurationSeconds * 1000))

  const rawDurations = script.sections.map((section) =>
    estimateTextDurationMs(section.narration),
  )
  const durations =
    targetDurationMs === undefined
      ? rawDurations
      : scaleDurations(rawDurations, targetDurationMs)

  let cursor = 0
  const sections = script.sections.map((section, index) => {
    const durationMs = durations[index]!
    const startMs = cursor
    const endMs = startMs + durationMs
    cursor = endMs
    return {
      sectionId: section.id,
      startMs,
      endMs,
      durationMs,
    }
  })

  return {
    schemaVersion: 1,
    id: options.id ?? `previs-timing-${script.id}`,
    projectId: project.id,
    scriptVersionId: script.id,
    createdAt: options.createdAt ?? new Date().toISOString(),
    method: 'heuristic',
    durationMs: cursor,
    ...(targetDurationMs === undefined ? {} : { targetDurationMs }),
    sections,
  }
}

export function estimateTextDurationMs(text: string): number {
  const normalized = text.normalize('NFKC')
  const characters = [...normalized]
  const cjkCount = characters.filter((character) =>
    isCjkCharacter(character),
  ).length

  const segmenter = new Intl.Segmenter(undefined, { granularity: 'word' })
  let nonCjkWords = 0
  for (const segment of segmenter.segment(normalized)) {
    if (!segment.isWordLike) continue
    if ([...segment.segment].some((character) => isCjkCharacter(character))) {
      continue
    }
    nonCjkWords += 1
  }

  const commaCount = (normalized.match(/[,，、;；:：]/gu) ?? []).length
  const sentenceCount = (normalized.match(/[.!?。！？]/gu) ?? []).length
  const newlineCount = (normalized.match(/\n/gu) ?? []).length

  return Math.max(
    MIN_SECTION_MS,
    Math.round(
      nonCjkWords * LATIN_WORD_MS +
        cjkCount * CJK_CHARACTER_MS +
        commaCount * COMMA_PAUSE_MS +
        sentenceCount * SENTENCE_PAUSE_MS +
        newlineCount * NEWLINE_PAUSE_MS,
    ),
  )
}

export function parsePrevisStoryboardArtifact(
  value: unknown,
  project: VideoProjectManifest,
  timing: EstimatedTiming,
): PrevisStoryboardArtifact {
  if (!isRecord(value)) {
    throw new Error('Invalid Previs Storyboard: artifact must be a JSON object')
  }

  const timingId = value.timingId
  if (timingId !== timing.id) {
    throw new Error(
      `Invalid Previs Storyboard:\n- timingId must be "${timing.id}"`,
    )
  }

  const candidate = value as unknown as PrevisStoryboardArtifact
  const fakeStoryboard: StoryboardArtifact = {
    schemaVersion: candidate.schemaVersion,
    id: candidate.id,
    projectId: candidate.projectId,
    alignmentId: candidate.timingId,
    createdAt: candidate.createdAt,
    video: candidate.video,
    scenes: candidate.scenes,
  }

  parseStoryboardArtifact(
    fakeStoryboard,
    project,
    estimatedTimingAsAlignment(timing),
  )

  return candidate
}

export function compilePrevisStoryboard(
  storyboard: PrevisStoryboardArtifact,
): SceneIR[] {
  return compileStoryboard({
    schemaVersion: storyboard.schemaVersion,
    id: storyboard.id,
    projectId: storyboard.projectId,
    alignmentId: storyboard.timingId,
    createdAt: storyboard.createdAt,
    video: storyboard.video,
    scenes: storyboard.scenes,
  })
}

export function promotePrevisStoryboard(
  storyboard: PrevisStoryboardArtifact,
  timing: EstimatedTiming,
  alignment: NarrationAlignment,
): StoryboardArtifact {
  if (storyboard.timingId !== timing.id) {
    throw new Error('Previs storyboard does not reference the supplied timing')
  }
  if (alignment.projectId !== storyboard.projectId) {
    throw new Error('Alignment belongs to another project')
  }
  if (alignment.scriptVersionId !== timing.scriptVersionId) {
    throw new Error('Real alignment targets a different script version')
  }
  if (storyboard.scenes.length === 0) {
    throw new Error('Previs storyboard has no scenes')
  }

  const mapTime = createRetimeMapper(timing, alignment)
  const boundaries = [
    storyboard.scenes[0]!.startMs,
    ...storyboard.scenes.map((scene) => scene.endMs),
  ]
  const mappedBoundaries = boundaries.map((boundary, index) => {
    if (index === 0) return 0
    if (index === boundaries.length - 1) return alignment.durationMs
    return mapTime(boundary)
  })

  const scenes = storyboard.scenes.map((scene, index) => {
    const startMs = mappedBoundaries[index]!
    const endMs = mappedBoundaries[index + 1]!
    if (endMs <= startMs) {
      throw new Error(
        `Real narration compresses scene "${scene.id}" to a non-positive duration`,
      )
    }
    return {
      ...structuredClone(scene),
      startMs,
      endMs,
    }
  })

  return {
    schemaVersion: 1,
    id: storyboard.id,
    projectId: storyboard.projectId,
    alignmentId: alignment.id,
    createdAt: new Date().toISOString(),
    video: structuredClone(storyboard.video),
    scenes,
  }
}

function createRetimeMapper(
  timing: EstimatedTiming,
  alignment: NarrationAlignment,
): (timeMs: number) => number {
  if (timing.sections.length === 0) {
    throw new Error('Estimated timing has no sections')
  }

  const alignedBySection = new Map(
    alignment.sections.map((section) => [section.sectionId, section]),
  )
  const anchors: Array<{ estimated: number; real: number }> = [
    { estimated: 0, real: 0 },
  ]

  for (const section of timing.sections.slice(1)) {
    const aligned = alignedBySection.get(section.sectionId)
    if (aligned?.startMs === undefined) {
      throw new Error(
        `Cannot promote previs: aligned section "${section.sectionId}" has no start time`,
      )
    }
    anchors.push({
      estimated: section.startMs,
      real: aligned.startMs,
    })
  }

  anchors.push({
    estimated: timing.durationMs,
    real: alignment.durationMs,
  })

  for (let index = 1; index < anchors.length; index += 1) {
    if (anchors[index]!.real < anchors[index - 1]!.real) {
      throw new Error('Alignment section timing is not monotonic')
    }
  }

  return (timeMs: number): number => {
    if (timeMs <= 0) return 0
    if (timeMs >= timing.durationMs) return alignment.durationMs

    for (let index = 1; index < anchors.length; index += 1) {
      const right = anchors[index]!
      if (timeMs > right.estimated) continue
      const left = anchors[index - 1]!
      const span = right.estimated - left.estimated
      if (span <= 0) return right.real
      const progress = (timeMs - left.estimated) / span
      return Math.round(left.real + (right.real - left.real) * progress)
    }

    return alignment.durationMs
  }
}

function estimatedTimingAsAlignment(
  timing: EstimatedTiming,
): NarrationAlignment {
  return {
    schemaVersion: 1,
    id: timing.id,
    projectId: timing.projectId,
    narrationId: '__previs__',
    scriptVersionId: timing.scriptVersionId,
    transcriptId: '__previs__',
    createdAt: timing.createdAt,
    durationMs: timing.durationMs,
    coverage: 1,
    acceptedLowCoverage: false,
    scriptTokens: [],
    deviations: [],
    pauses: [],
    sections: timing.sections.map((section) => ({
      sectionId: section.sectionId,
      startMs: section.startMs,
      endMs: section.endMs,
      coverage: 1,
    })),
  }
}

function scaleDurations(
  durations: readonly number[],
  targetDurationMs: number,
): number[] {
  if (!Number.isInteger(targetDurationMs) || targetDurationMs <= 0) {
    throw new Error('targetDurationMs must be a positive integer')
  }
  const total = durations.reduce((sum, duration) => sum + duration, 0)
  if (total <= 0) throw new Error('Cannot scale an empty timing estimate')

  const scaled = durations.map((duration) =>
    Math.max(1, Math.round((duration / total) * targetDurationMs)),
  )
  const current = scaled.reduce((sum, duration) => sum + duration, 0)
  scaled[scaled.length - 1] =
    scaled[scaled.length - 1]! + (targetDurationMs - current)

  if (scaled[scaled.length - 1]! <= 0) {
    throw new Error('Target duration is too short for the script structure')
  }
  return scaled
}

function isCjkCharacter(character: string): boolean {
  return /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(
    character,
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
