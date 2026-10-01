import type {
  AlignedScriptToken,
  AlignedSection,
  NarrationAlignment,
  NarrationPause,
  ScriptDeviation,
  ScriptToken,
  ScriptVersion,
  TranscriptArtifact,
} from '@videooo/domain'

interface ComparableTranscriptToken {
  id: string
  text: string
  normalized: string
  startMs: number
  endMs: number
  sourceTokenIds: string[]
}

type Operation =
  | { kind: 'pair'; scriptIndex: number; transcriptIndex: number }
  | { kind: 'delete'; scriptIndex: number }
  | { kind: 'insert'; transcriptIndex: number }

export interface BuildAlignmentOptions {
  id?: string
  createdAt?: string
  pauseThresholdMs?: number
  acceptedLowCoverage?: boolean
}

export function buildNarrationAlignment(
  script: ScriptVersion,
  transcript: TranscriptArtifact,
  options: BuildAlignmentOptions = {},
): NarrationAlignment {
  const scriptTokens = tokenizeScript(script)
  const transcriptTokens = tokenizeTranscript(transcript)
  const operations = alignSequences(scriptTokens, transcriptTokens)
  const aligned = scriptTokens.map<AlignedScriptToken>((token) => ({
    ...token,
    transcriptTokenIds: [],
    status: 'missing',
  }))
  const deviations: ScriptDeviation[] = []
  let deviationIndex = 1

  for (const operation of operations) {
    if (operation.kind === 'pair') {
      const scriptToken = scriptTokens[operation.scriptIndex]!
      const spoken = transcriptTokens[operation.transcriptIndex]!
      const exact = scriptToken.text === spoken.text
      const normalized = scriptToken.normalized === spoken.normalized
      const status = exact ? 'exact' : normalized ? 'normalized' : 'substituted'

      aligned[operation.scriptIndex] = {
        ...scriptToken,
        startMs: spoken.startMs,
        endMs: spoken.endMs,
        transcriptTokenIds: spoken.sourceTokenIds,
        status,
      }

      if (!normalized) {
        deviations.push({
          id: deviationId(deviationIndex++),
          kind: 'substitution',
          sectionId: scriptToken.sectionId,
          scriptText: scriptToken.text,
          spokenText: spoken.text,
          startMs: spoken.startMs,
          endMs: spoken.endMs,
        })
      }
      continue
    }

    if (operation.kind === 'delete') {
      const scriptToken = scriptTokens[operation.scriptIndex]!
      deviations.push({
        id: deviationId(deviationIndex++),
        kind: 'deletion',
        sectionId: scriptToken.sectionId,
        scriptText: scriptToken.text,
      })
      continue
    }

    const spoken = transcriptTokens[operation.transcriptIndex]!
    deviations.push({
      id: deviationId(deviationIndex++),
      kind: 'insertion',
      spokenText: spoken.text,
      startMs: spoken.startMs,
      endMs: spoken.endMs,
    })
  }

  interpolateShortGaps(aligned)

  const timed = aligned.filter(
    (token) => token.startMs !== undefined && token.endMs !== undefined,
  ).length
  const coverage = aligned.length === 0 ? 1 : timed / aligned.length

  return {
    schemaVersion: 1,
    id: options.id ?? `alignment-${transcript.id}`,
    projectId: transcript.projectId,
    narrationId: transcript.narrationId,
    scriptVersionId: script.id,
    transcriptId: transcript.id,
    createdAt: options.createdAt ?? new Date().toISOString(),
    durationMs: transcript.durationMs,
    coverage,
    acceptedLowCoverage: options.acceptedLowCoverage ?? false,
    scriptTokens: aligned,
    deviations,
    pauses: detectPauses(
      transcriptTokens,
      options.pauseThresholdMs ?? 350,
    ),
    sections: buildSections(script, aligned),
  }
}

export function tokenizeScript(script: ScriptVersion): ScriptToken[] {
  const tokens: ScriptToken[] = []
  let index = 0

  for (const section of script.sections) {
    for (const word of segmentWords(section.narration)) {
      tokens.push({
        id: `script-token-${String(index + 1).padStart(5, '0')}`,
        sectionId: section.id,
        index,
        text: word,
        normalized: normalizeToken(word),
      })
      index += 1
    }
  }

  return tokens
}

export function normalizeToken(value: string): string {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/[’‘]/gu, "'")
    .replace(/[^\p{L}\p{N}]+/gu, '')
}

function tokenizeTranscript(
  transcript: TranscriptArtifact,
): ComparableTranscriptToken[] {
  const result: ComparableTranscriptToken[] = []

  for (const token of transcript.tokens) {
    const words = segmentWords(token.text)
    if (words.length === 0) continue

    const duration = Math.max(0, token.endMs - token.startMs)
    for (const [index, word] of words.entries()) {
      const startMs =
        token.startMs + Math.round((duration * index) / words.length)
      const endMs =
        token.startMs + Math.round((duration * (index + 1)) / words.length)
      result.push({
        id: `${token.id}:${index}`,
        text: word,
        normalized: normalizeToken(word),
        startMs,
        endMs,
        sourceTokenIds: [token.id],
      })
    }
  }

  return result
}

function segmentWords(value: string): string[] {
  const segmenter = new Intl.Segmenter(undefined, { granularity: 'word' })
  const result: string[] = []

  for (const segment of segmenter.segment(value)) {
    const text = segment.segment.trim()
    if (text.length === 0) continue
    const wordLike =
      segment.isWordLike ??
      /[\p{L}\p{N}]/u.test(text)
    if (!wordLike) continue
    if (normalizeToken(text).length === 0) continue
    result.push(text)
  }

  return result
}

function alignSequences(
  script: readonly ScriptToken[],
  transcript: readonly ComparableTranscriptToken[],
): Operation[] {
  const rows = script.length + 1
  const cols = transcript.length + 1
  const cost = Array.from({ length: rows }, () =>
    Array<number>(cols).fill(0),
  )
  const back = Array.from({ length: rows }, () =>
    Array<'diag' | 'up' | 'left' | null>(cols).fill(null),
  )

  for (let i = 1; i < rows; i += 1) {
    cost[i]![0] = i
    back[i]![0] = 'up'
  }
  for (let j = 1; j < cols; j += 1) {
    cost[0]![j] = j
    back[0]![j] = 'left'
  }

  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      const scriptToken = script[i - 1]!
      const spoken = transcript[j - 1]!
      const normalizedMatch =
        scriptToken.normalized.length > 0 &&
        scriptToken.normalized === spoken.normalized
      const diagonal =
        cost[i - 1]![j - 1]! + (normalizedMatch ? 0 : 1.25)
      const up = cost[i - 1]![j]! + 1
      const left = cost[i]![j - 1]! + 1

      if (diagonal <= up && diagonal <= left) {
        cost[i]![j] = diagonal
        back[i]![j] = 'diag'
      } else if (up <= left) {
        cost[i]![j] = up
        back[i]![j] = 'up'
      } else {
        cost[i]![j] = left
        back[i]![j] = 'left'
      }
    }
  }

  const operations: Operation[] = []
  let i = script.length
  let j = transcript.length

  while (i > 0 || j > 0) {
    const direction = back[i]![j]
    if (direction === 'diag') {
      operations.push({
        kind: 'pair',
        scriptIndex: i - 1,
        transcriptIndex: j - 1,
      })
      i -= 1
      j -= 1
    } else if (direction === 'up') {
      operations.push({ kind: 'delete', scriptIndex: i - 1 })
      i -= 1
    } else if (direction === 'left') {
      operations.push({ kind: 'insert', transcriptIndex: j - 1 })
      j -= 1
    } else {
      break
    }
  }

  return operations.reverse()
}

function interpolateShortGaps(tokens: AlignedScriptToken[]): void {
  let index = 0

  while (index < tokens.length) {
    if (tokens[index]!.status !== 'missing') {
      index += 1
      continue
    }

    const start = index
    while (index < tokens.length && tokens[index]!.status === 'missing') {
      index += 1
    }
    const end = index - 1
    const count = end - start + 1

    if (count > 3 || start === 0 || index >= tokens.length) continue

    const previous = tokens[start - 1]!
    const next = tokens[index]!
    if (
      previous.sectionId !== next.sectionId ||
      tokens.slice(start, end + 1).some(
        (token) => token.sectionId !== previous.sectionId,
      ) ||
      previous.endMs === undefined ||
      next.startMs === undefined ||
      next.startMs < previous.endMs
    ) {
      continue
    }

    const gap = next.startMs - previous.endMs
    for (let offset = 0; offset < count; offset += 1) {
      const token = tokens[start + offset]!
      token.startMs =
        previous.endMs + Math.round((gap * offset) / count)
      token.endMs =
        previous.endMs + Math.round((gap * (offset + 1)) / count)
      token.status = 'interpolated'
    }
  }
}

function detectPauses(
  tokens: readonly ComparableTranscriptToken[],
  thresholdMs: number,
): NarrationPause[] {
  const pauses: NarrationPause[] = []

  for (let index = 1; index < tokens.length; index += 1) {
    const previous = tokens[index - 1]!
    const current = tokens[index]!
    const durationMs = current.startMs - previous.endMs

    if (durationMs >= thresholdMs) {
      pauses.push({
        startMs: previous.endMs,
        endMs: current.startMs,
        durationMs,
      })
    }
  }

  return pauses
}

function buildSections(
  script: ScriptVersion,
  tokens: readonly AlignedScriptToken[],
): AlignedSection[] {
  return script.sections.map((section) => {
    const sectionTokens = tokens.filter(
      (token) => token.sectionId === section.id,
    )
    const timed = sectionTokens.filter(
      (token) => token.startMs !== undefined && token.endMs !== undefined,
    )
    const first = timed.at(0)
    const last = timed.at(-1)

    return {
      sectionId: section.id,
      ...(first?.startMs === undefined ? {} : { startMs: first.startMs }),
      ...(last?.endMs === undefined ? {} : { endMs: last.endMs }),
      coverage:
        sectionTokens.length === 0 ? 1 : timed.length / sectionTokens.length,
    }
  })
}

function deviationId(index: number): string {
  return `deviation-${String(index).padStart(4, '0')}`
}
