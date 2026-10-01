import type {
  NarrationAlignment,
  NarrationAsset,
  TranscriptArtifact,
  VideoProjectManifest,
} from '@videooo/domain'
import { ArtifactValidationError } from './index.js'

export const DEFAULT_ALIGNMENT_COVERAGE = 0.85

export function acceptNarration(
  project: VideoProjectManifest,
  narration: NarrationAsset,
  now = new Date().toISOString(),
): VideoProjectManifest {
  if (project.stage !== 'approved') {
    throw new Error(
      `Narration import requires stage "approved"; current stage is "${project.stage}"`,
    )
  }
  if (project.approvedScriptVersionId === undefined) {
    throw new Error('Project has no approved script version')
  }
  if (narration.projectId !== project.id) {
    throw new Error('Narration belongs to another project')
  }
  if (narration.scriptVersionId !== project.approvedScriptVersionId) {
    throw new Error('Narration must target the approved script version')
  }

  return {
    ...project,
    stage: 'recorded',
    narrationId: narration.id,
    updatedAt: now,
  }
}

export function parseTranscriptArtifact(
  value: unknown,
  project: VideoProjectManifest,
  narration: NarrationAsset,
): TranscriptArtifact {
  const issues = validateTranscriptShape(value)
  if (issues.length > 0) {
    throw new ArtifactValidationError('Transcript Artifact', issues)
  }

  const transcript = value as TranscriptArtifact
  const semanticIssues = validateTranscriptArtifact(
    transcript,
    project,
    narration,
  )
  if (semanticIssues.length > 0) {
    throw new ArtifactValidationError('Transcript Artifact', semanticIssues)
  }

  return transcript
}

export function validateTranscriptArtifact(
  transcript: TranscriptArtifact,
  project: VideoProjectManifest,
  narration: NarrationAsset,
): string[] {
  const issues: string[] = []

  if (transcript.projectId !== project.id) {
    issues.push(`projectId must be "${project.id}"`)
  }
  if (transcript.narrationId !== narration.id) {
    issues.push(`narrationId must be "${narration.id}"`)
  }
  if (transcript.durationMs <= 0) {
    issues.push('durationMs must be positive')
  }
  if (transcript.tokens.length === 0) {
    issues.push('tokens must contain at least one timed token')
  }

  validateTimedUnits(
    transcript.segments,
    transcript.durationMs,
    'segment',
    issues,
  )
  validateTimedUnits(
    transcript.tokens,
    transcript.durationMs,
    'token',
    issues,
  )

  const segmentIds = new Set<string>()
  for (const segment of transcript.segments) {
    if (segmentIds.has(segment.id)) {
      issues.push(`duplicate segment id "${segment.id}"`)
    }
    segmentIds.add(segment.id)
  }

  const tokenIds = new Set<string>()
  for (const token of transcript.tokens) {
    if (tokenIds.has(token.id)) {
      issues.push(`duplicate token id "${token.id}"`)
    }
    tokenIds.add(token.id)

    if (
      token.confidence !== undefined &&
      (token.confidence < 0 || token.confidence > 1)
    ) {
      issues.push(
        `token "${token.id}" confidence must be between 0 and 1`,
      )
    }
  }

  return issues
}

export function acceptTranscript(
  project: VideoProjectManifest,
  transcript: TranscriptArtifact,
  now = new Date().toISOString(),
): VideoProjectManifest {
  if (project.stage !== 'recorded') {
    throw new Error(
      `Transcript import requires stage "recorded"; current stage is "${project.stage}"`,
    )
  }
  if (transcript.projectId !== project.id) {
    throw new Error('Transcript belongs to another project')
  }
  if (transcript.narrationId !== project.narrationId) {
    throw new Error('Transcript targets another narration')
  }

  return {
    ...project,
    transcriptId: transcript.id,
    updatedAt: now,
  }
}

export function acceptAlignment(
  project: VideoProjectManifest,
  alignment: NarrationAlignment,
  minimumCoverage = DEFAULT_ALIGNMENT_COVERAGE,
  now = new Date().toISOString(),
): VideoProjectManifest {
  if (project.stage !== 'recorded') {
    throw new Error(
      `Alignment acceptance requires stage "recorded"; current stage is "${project.stage}"`,
    )
  }
  if (alignment.projectId !== project.id) {
    throw new Error('Alignment belongs to another project')
  }
  if (alignment.narrationId !== project.narrationId) {
    throw new Error('Alignment targets another narration')
  }
  if (alignment.transcriptId !== project.transcriptId) {
    throw new Error('Alignment targets another transcript')
  }
  if (alignment.scriptVersionId !== project.approvedScriptVersionId) {
    throw new Error('Alignment targets another script version')
  }
  if (
    alignment.coverage < minimumCoverage &&
    !alignment.acceptedLowCoverage
  ) {
    throw new Error(
      `Alignment coverage ${alignment.coverage.toFixed(3)} is below the required ${minimumCoverage.toFixed(3)}`,
    )
  }

  return {
    ...project,
    stage: 'aligned',
    alignmentId: alignment.id,
    updatedAt: now,
  }
}

function validateTranscriptShape(value: unknown): string[] {
  if (!isRecord(value)) return ['artifact must be a JSON object']

  const issues: string[] = []
  if (value.schemaVersion !== 1) issues.push('schemaVersion must be 1')
  requireString(value.id, 'id', issues)
  requireString(value.projectId, 'projectId', issues)
  requireString(value.narrationId, 'narrationId', issues)
  requireString(value.createdAt, 'createdAt', issues)
  requireString(value.provider, 'provider', issues)
  requireString(value.text, 'text', issues)

  if (
    typeof value.durationMs !== 'number' ||
    !Number.isFinite(value.durationMs)
  ) {
    issues.push('durationMs must be a finite number')
  }

  validateTimedUnitShape(value.segments, 'segments', issues, false)
  validateTimedUnitShape(value.tokens, 'tokens', issues, true)
  return issues
}

function validateTimedUnitShape(
  value: unknown,
  path: string,
  issues: string[],
  confidence: boolean,
): void {
  if (!Array.isArray(value)) {
    issues.push(`${path} must be an array`)
    return
  }

  for (const [index, unit] of value.entries()) {
    if (!isRecord(unit)) {
      issues.push(`${path}[${index}] must be an object`)
      continue
    }

    requireString(unit.id, `${path}[${index}].id`, issues)
    requireString(unit.text, `${path}[${index}].text`, issues)
    requireFiniteNumber(unit.startMs, `${path}[${index}].startMs`, issues)
    requireFiniteNumber(unit.endMs, `${path}[${index}].endMs`, issues)

    if (
      confidence &&
      unit.confidence !== undefined &&
      typeof unit.confidence !== 'number'
    ) {
      issues.push(`${path}[${index}].confidence must be a number`)
    }
  }
}

function validateTimedUnits(
  units: readonly { id: string; startMs: number; endMs: number }[],
  durationMs: number,
  label: string,
  issues: string[],
): void {
  let previousStart = -1

  for (const unit of units) {
    if (unit.startMs < 0 || unit.endMs < 0) {
      issues.push(`${label} "${unit.id}" timestamps must be non-negative`)
    }
    if (unit.endMs < unit.startMs) {
      issues.push(`${label} "${unit.id}" ends before it starts`)
    }
    if (unit.startMs < previousStart) {
      issues.push(`${label} "${unit.id}" timestamps are not monotonic`)
    }
    if (unit.endMs > durationMs) {
      issues.push(`${label} "${unit.id}" exceeds transcript duration`)
    }
    previousStart = unit.startMs
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function requireString(value: unknown, path: string, issues: string[]): void {
  if (typeof value !== 'string' || value.trim().length === 0) {
    issues.push(`${path} must be a non-empty string`)
  }
}

function requireFiniteNumber(
  value: unknown,
  path: string,
  issues: string[],
): void {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    issues.push(`${path} must be a finite number`)
  }
}
