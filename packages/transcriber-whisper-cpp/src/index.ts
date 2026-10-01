import { randomUUID } from 'node:crypto'
import { readFile, rm, stat } from 'node:fs/promises'
import { basename, dirname, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import type {
  TranscriptArtifact,
  TranscriptSegment,
  TranscriptToken,
} from '@videooo/domain'
import type {
  Transcriber,
  TranscriptionRequest,
} from '@videooo/transcription'

export interface WhisperCppTranscriberOptions {
  modelPath?: string
  binary?: string
  ffmpegBinary?: string
  language?: string
}

export interface WhisperCppParseContext {
  projectId: string
  narrationId: string
  model?: string
  createdAt?: string
}

export class WhisperCppTranscriber implements Transcriber {
  readonly id = 'whisper-cpp'
  private readonly options: WhisperCppTranscriberOptions

  constructor(options: WhisperCppTranscriberOptions = {}) {
    this.options = options
  }

  async transcribe(
    request: TranscriptionRequest,
  ): Promise<TranscriptArtifact> {
    const modelPath =
      this.options.modelPath ?? process.env.VIDEOOO_WHISPER_CPP_MODEL
    if (modelPath === undefined || modelPath.trim().length === 0) {
      throw new Error(
        'whisper.cpp model is required. Pass --model or set VIDEOOO_WHISPER_CPP_MODEL.',
      )
    }

    const modelStat = await stat(resolve(modelPath)).catch(() => null)
    if (modelStat === null || !modelStat.isFile()) {
      throw new Error(`whisper.cpp model does not exist: ${modelPath}`)
    }

    const whisperBinary =
      this.options.binary ??
      process.env.VIDEOOO_WHISPER_CPP_BIN ??
      'whisper-cli'
    const ffmpegBinary =
      this.options.ffmpegBinary ??
      process.env.VIDEOOO_FFMPEG_BIN ??
      'ffmpeg'
    const language =
      request.language ?? this.options.language ?? 'auto'

    assertCommand(ffmpegBinary, ['-version'], 'ffmpeg')
    assertCommand(whisperBinary, ['--help'], 'whisper-cli')

    const narrationDirectory = dirname(resolve(request.audioPath))
    const normalizedPath = resolve(narrationDirectory, 'normalized.wav')
    const outputBase = resolve(
      narrationDirectory,
      `.whisper-${randomUUID()}`,
    )
    const outputJson = `${outputBase}.json`

    runCommand(
      ffmpegBinary,
      buildFfmpegArgs(request.audioPath, normalizedPath),
      'ffmpeg normalization',
    )

    try {
      runCommand(
        whisperBinary,
        buildWhisperCppArgs({
          modelPath,
          audioPath: normalizedPath,
          outputBase,
          language,
        }),
        'whisper.cpp transcription',
      )

      const raw = JSON.parse(await readFile(outputJson, 'utf8')) as unknown
      return parseWhisperCppJson(raw, {
        projectId: request.projectId,
        narrationId: request.narrationId,
        model: basename(modelPath),
      })
    } finally {
      await rm(outputJson, { force: true })
    }
  }
}

export function buildFfmpegArgs(
  inputPath: string,
  outputPath: string,
): string[] {
  return [
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    '-i',
    resolve(inputPath),
    '-ar',
    '16000',
    '-ac',
    '1',
    '-c:a',
    'pcm_s16le',
    resolve(outputPath),
  ]
}

export function buildWhisperCppArgs(input: {
  modelPath: string
  audioPath: string
  outputBase: string
  language: string
}): string[] {
  return [
    '-m',
    resolve(input.modelPath),
    '-f',
    resolve(input.audioPath),
    '-ojf',
    '-of',
    resolve(input.outputBase),
    '-l',
    input.language,
    '-np',
  ]
}

export function parseWhisperCppJson(
  value: unknown,
  context: WhisperCppParseContext,
): TranscriptArtifact {
  if (!isRecord(value) || !Array.isArray(value.transcription)) {
    throw new Error('Invalid whisper.cpp JSON: missing transcription array')
  }

  const segments: TranscriptSegment[] = []
  const tokens: TranscriptToken[] = []
  const texts: string[] = []
  let tokenIndex = 1
  let durationMs = 0

  for (const [segmentIndex, item] of value.transcription.entries()) {
    if (!isRecord(item)) {
      throw new Error(
        `Invalid whisper.cpp JSON: transcription[${segmentIndex}] is not an object`,
      )
    }

    const offsets = readOffsets(
      item.offsets,
      `transcription[${segmentIndex}].offsets`,
    )
    const text = typeof item.text === 'string' ? item.text : ''
    durationMs = Math.max(durationMs, offsets.to)
    texts.push(text)
    segments.push({
      id: `segment-${String(segmentIndex + 1).padStart(4, '0')}`,
      startMs: offsets.from,
      endMs: offsets.to,
      text: text.trim() || text,
    })

    if (!Array.isArray(item.tokens)) continue
    for (const tokenValue of item.tokens) {
      if (!isRecord(tokenValue) || typeof tokenValue.text !== 'string') {
        continue
      }

      const tokenText = tokenValue.text
      if (
        tokenText.trim().length === 0 ||
        /^<\|.*\|>$/u.test(tokenText.trim())
      ) {
        continue
      }

      const tokenOffsets = readOffsets(
        tokenValue.offsets,
        `transcription[${segmentIndex}].tokens.offsets`,
      )
      durationMs = Math.max(durationMs, tokenOffsets.to)
      const confidence =
        typeof tokenValue.p === 'number' &&
        Number.isFinite(tokenValue.p) &&
        tokenValue.p >= 0 &&
        tokenValue.p <= 1
          ? tokenValue.p
          : undefined

      tokens.push({
        id: `token-${String(tokenIndex).padStart(5, '0')}`,
        startMs: tokenOffsets.from,
        endMs: tokenOffsets.to,
        text: tokenText,
        ...(confidence === undefined ? {} : { confidence }),
      })
      tokenIndex += 1
    }
  }

  if (tokens.length === 0) {
    throw new Error(
      'Invalid whisper.cpp JSON: no timed transcript tokens were produced',
    )
  }
  if (durationMs <= 0) {
    throw new Error(
      'Invalid whisper.cpp JSON: transcript duration is not positive',
    )
  }

  const result = isRecord(value.result) ? value.result : {}
  const language =
    typeof result.language === 'string' && result.language.length > 0
      ? result.language
      : undefined

  return {
    schemaVersion: 1,
    id: `transcript-${context.narrationId}`,
    projectId: context.projectId,
    narrationId: context.narrationId,
    createdAt: context.createdAt ?? new Date().toISOString(),
    provider: 'whisper-cpp',
    ...(context.model === undefined ? {} : { model: context.model }),
    ...(language === undefined ? {} : { language }),
    durationMs,
    text: texts.join('').trim(),
    segments,
    tokens,
  }
}

function readOffsets(
  value: unknown,
  path: string,
): { from: number; to: number } {
  if (
    !isRecord(value) ||
    typeof value.from !== 'number' ||
    typeof value.to !== 'number' ||
    !Number.isFinite(value.from) ||
    !Number.isFinite(value.to) ||
    value.from < 0 ||
    value.to < value.from
  ) {
    throw new Error(`Invalid whisper.cpp JSON offsets at ${path}`)
  }

  return { from: value.from, to: value.to }
}

function assertCommand(
  command: string,
  args: string[],
  label: string,
): void {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  if (result.error !== undefined || result.status !== 0) {
    throw new Error(
      `${label} is not available. Configure its path or install it before transcription.`,
    )
  }
}

function runCommand(
  command: string,
  args: string[],
  label: string,
): void {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 16 * 1024 * 1024,
  })

  if (result.error !== undefined || result.status !== 0) {
    const details = [result.stderr, result.stdout]
      .filter((part) => typeof part === 'string' && part.trim().length > 0)
      .join('\n')
      .trim()
    throw new Error(
      `${label} failed${details.length === 0 ? '' : `:\n${details}`}`,
    )
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
