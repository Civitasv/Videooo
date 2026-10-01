import { spawnSync } from 'node:child_process'
import { mkdir, stat } from 'node:fs/promises'
import { resolve } from 'node:path'
import type {
  NarrationAlignment,
  QaEvidencePack,
  QaFinding,
  QaFrameSample,
  QaReport,
  QaReviewArtifact,
  QaSceneEvidence,
  SceneIR,
  SceneRenderAsset,
  ScriptVersion,
  VideoProjectManifest,
  VideoRenderManifest,
} from '@videooo/domain'

const SAMPLE_PROGRESS = [0.1, 0.5, 0.9] as const

export interface PrepareQaEvidenceInput {
  project: VideoProjectManifest
  render: VideoRenderManifest
  alignment: NarrationAlignment
  script: ScriptVersion
  scenes: readonly SceneIR[]
  sceneRenderAssets: readonly SceneRenderAsset[]
  manimAssetPaths: Readonly<Record<string, string>>
  videoPath: string
  videoPathLabel: string
  framesDirectory: string
  evidenceId: string
  createdAt?: string
  ffmpegBinary?: string
  ffprobeBinary?: string
}

export interface FrameSamplePlan {
  sceneId: string
  timeMs: number
  localProgress: number
  frame: number
  fileName: string
}

export async function prepareQaEvidence(
  input: PrepareQaEvidenceInput,
): Promise<QaEvidencePack> {
  const findings: QaFinding[] = []
  let findingIndex = 1

  const addStructural = (
    sceneId: string,
    message: string,
    repairHint?: string,
  ): void => {
    findings.push({
      id: `struct-${String(findingIndex).padStart(4, '0')}`,
      sceneId,
      severity: 'error',
      category: 'structural',
      message,
      ...(repairHint === undefined ? {} : { repairHint }),
    })
    findingIndex += 1
  }

  if (input.project.renderId !== input.render.id) {
    addStructural(
      '__video__',
      'Project renderId does not match the current render manifest.',
    )
  }
  if (input.render.projectId !== input.project.id) {
    addStructural('__video__', 'Render manifest belongs to another project.')
  }
  if (input.render.storyboardId !== input.project.storyboardId) {
    addStructural(
      '__video__',
      'Render manifest storyboardId does not match the project.',
    )
  }
  if (input.render.alignmentId !== input.alignment.id) {
    addStructural(
      '__video__',
      'Render manifest alignmentId does not match the current alignment.',
    )
  }
  if (input.project.sceneCount !== input.scenes.length) {
    addStructural(
      '__video__',
      `Project sceneCount ${String(input.project.sceneCount)} does not match ${input.scenes.length} Scene IR file(s).`,
    )
  }

  validateSceneTimeline(input.scenes, input.alignment.durationMs, addStructural)

  let videoExists = false
  try {
    const info = await stat(input.videoPath)
    videoExists = info.isFile() && info.size > 0
    if (!videoExists) {
      addStructural('__video__', 'Draft render is missing or empty.')
    }
  } catch {
    addStructural('__video__', 'Draft render does not exist.')
  }

  const ffprobe =
    input.ffprobeBinary ?? process.env.VIDEOOO_FFPROBE_BIN ?? 'ffprobe'
  const ffmpeg =
    input.ffmpegBinary ?? process.env.VIDEOOO_FFMPEG_BIN ?? 'ffmpeg'

  if (videoExists) {
    if (commandAvailable(ffprobe, ['-version'])) {
      try {
        const actualDurationMs = probeDurationMs(ffprobe, input.videoPath)
        const tolerance = Math.max(
          150,
          1000 / Math.max(1, input.render.fps),
        )
        if (
          Math.abs(actualDurationMs - input.alignment.durationMs) >
          tolerance
        ) {
          addStructural(
            '__video__',
            `Rendered duration ${actualDurationMs.toFixed(1)}ms differs from alignment duration ${input.alignment.durationMs}ms by more than ${tolerance.toFixed(1)}ms.`,
          )
        }
      } catch (error) {
        addStructural(
          '__video__',
          `Unable to verify rendered duration: ${errorMessage(error)}`,
        )
      }
    } else {
      addStructural(
        '__video__',
        'ffprobe is unavailable, so final render duration cannot be verified.',
      )
    }
  }

  const assetByScene = new Map(
    input.sceneRenderAssets.map((asset) => [asset.sceneId, asset]),
  )
  for (const scene of input.scenes) {
    if (scene.renderer !== 'manim') continue
    const asset = assetByScene.get(scene.id)
    const path = input.manimAssetPaths[scene.id]
    if (asset === undefined || path === undefined) {
      addStructural(
        scene.id,
        'Manim-routed scene has no persisted render asset.',
      )
      continue
    }
    try {
      const info = await stat(path)
      if (!info.isFile() || info.size <= 0) {
        addStructural(scene.id, 'Persisted Manim scene asset is empty.')
      }
    } catch {
      addStructural(scene.id, 'Persisted Manim scene asset file is missing.')
    }
  }

  const scriptSections = new Map(
    input.script.sections.map((section) => [section.id, section.narration]),
  )
  const canExtract =
    videoExists && commandAvailable(ffmpeg, ['-version'])

  if (videoExists && !canExtract) {
    addStructural(
      '__video__',
      'ffmpeg is unavailable, so visual QA evidence frames cannot be extracted.',
    )
  }

  await mkdir(input.framesDirectory, { recursive: true })
  const plans = planQaFrameSamples(
    input.scenes,
    input.render.fps,
  )
  const plansByScene = groupPlans(plans)

  const sceneEvidence: QaSceneEvidence[] = []
  for (const scene of input.scenes) {
    const frameSamples: QaFrameSample[] = []
    if (canExtract) {
      for (const plan of plansByScene.get(scene.id) ?? []) {
        const path = resolve(input.framesDirectory, plan.fileName)
        try {
          extractFrame(ffmpeg, input.videoPath, plan.timeMs, path)
          const info = await stat(path)
          if (!info.isFile() || info.size <= 0) {
            throw new Error('extracted frame is empty')
          }
          frameSamples.push({
            id: sampleId(plan.sceneId, plan.localProgress),
            sceneId: plan.sceneId,
            timeMs: plan.timeMs,
            localProgress: plan.localProgress,
            fileName: plan.fileName,
          })
        } catch (error) {
          addStructural(
            scene.id,
            `Failed to extract QA frame at ${plan.timeMs}ms: ${errorMessage(error)}`,
          )
        }
      }
    }

    sceneEvidence.push({
      sceneId: scene.id,
      renderer: scene.renderer,
      visualKind: scene.visualKind,
      teachingGoal: scene.teachingGoal,
      startMs: scene.startMs,
      endMs: scene.startMs + scene.durationMs,
      narrationText: scene.sectionIds
        .map((sectionId) => scriptSections.get(sectionId))
        .filter((value): value is string => value !== undefined)
        .join('\n'),
      frameSamples,
    })
  }

  return {
    schemaVersion: 1,
    id: input.evidenceId,
    projectId: input.project.id,
    renderId: input.render.id,
    storyboardId: input.render.storyboardId,
    alignmentId: input.alignment.id,
    createdAt: input.createdAt ?? new Date().toISOString(),
    videoPath: input.videoPathLabel,
    durationMs: input.alignment.durationMs,
    scenes: sceneEvidence,
    structuralFindings: findings,
  }
}

export function planQaFrameSamples(
  scenes: readonly SceneIR[],
  fps: number,
): FrameSamplePlan[] {
  const results: FrameSamplePlan[] = []
  const frameRate = Math.max(1, fps)

  for (const scene of scenes) {
    const seenFrames = new Set<number>()
    const endMs = scene.startMs + scene.durationMs

    for (const progress of SAMPLE_PROGRESS) {
      const rawTime =
        scene.startMs + Math.round(scene.durationMs * progress)
      const timeMs = Math.max(
        scene.startMs,
        Math.min(endMs - 1, rawTime),
      )
      const frame = Math.max(
        0,
        Math.round((timeMs / 1000) * frameRate),
      )
      if (seenFrames.has(frame)) continue
      seenFrames.add(frame)

      results.push({
        sceneId: scene.id,
        timeMs,
        localProgress: progress,
        frame,
        fileName: `${safeName(scene.id)}__${String(
          Math.round(progress * 1000),
        ).padStart(4, '0')}.png`,
      })
    }
  }

  return results
}

export function parseQaReviewArtifact(
  value: unknown,
  evidence: QaEvidencePack,
): QaReviewArtifact {
  const issues: string[] = []
  if (!isRecord(value)) {
    throw new Error('Invalid QA Review: artifact must be a JSON object')
  }

  if (value.schemaVersion !== 1) issues.push('schemaVersion must be 1')
  requireString(value.id, 'id', issues)
  requireString(value.projectId, 'projectId', issues)
  requireString(value.evidenceId, 'evidenceId', issues)
  requireString(value.createdAt, 'createdAt', issues)

  if (value.projectId !== evidence.projectId) {
    issues.push(`projectId must be "${evidence.projectId}"`)
  }
  if (value.evidenceId !== evidence.id) {
    issues.push(`evidenceId must be "${evidence.id}"`)
  }

  const validScenes = new Set(evidence.scenes.map((scene) => scene.sceneId))
  const validFrames = new Set(
    evidence.scenes.flatMap((scene) =>
      scene.frameSamples.map((frame) => frame.id),
    ),
  )
  const structuralIds = new Set(
    evidence.structuralFindings.map((finding) => finding.id),
  )
  const findingIds = new Set<string>()

  if (!Array.isArray(value.findings)) {
    issues.push('findings must be an array')
  } else {
    for (const [index, raw] of value.findings.entries()) {
      const path = `findings[${index}]`
      if (!isRecord(raw)) {
        issues.push(`${path} must be an object`)
        continue
      }

      requireString(raw.id, `${path}.id`, issues)
      requireString(raw.sceneId, `${path}.sceneId`, issues)
      requireString(raw.message, `${path}.message`, issues)

      if (
        raw.severity !== 'info' &&
        raw.severity !== 'warning' &&
        raw.severity !== 'error'
      ) {
        issues.push(`${path}.severity is invalid`)
      }
      if (
        raw.category !== 'visual' &&
        raw.category !== 'semantic' &&
        raw.category !== 'continuity'
      ) {
        issues.push(
          `${path}.category must be visual, semantic, or continuity`,
        )
      }

      if (
        typeof raw.sceneId === 'string' &&
        !validScenes.has(raw.sceneId)
      ) {
        issues.push(`${path}.sceneId references unknown scene "${raw.sceneId}"`)
      }

      if (typeof raw.id === 'string') {
        if (findingIds.has(raw.id) || structuralIds.has(raw.id)) {
          issues.push(`duplicate QA finding id "${raw.id}"`)
        }
        findingIds.add(raw.id)
      }

      if (raw.evidenceFrameIds !== undefined) {
        if (!Array.isArray(raw.evidenceFrameIds)) {
          issues.push(`${path}.evidenceFrameIds must be an array`)
        } else {
          for (const frameId of raw.evidenceFrameIds) {
            if (typeof frameId !== 'string' || !validFrames.has(frameId)) {
              issues.push(
                `${path}.evidenceFrameIds references unknown frame "${String(frameId)}"`,
              )
            }
          }
        }
      }

      if (
        raw.repairHint !== undefined &&
        (typeof raw.repairHint !== 'string' ||
          raw.repairHint.trim().length === 0)
      ) {
        issues.push(`${path}.repairHint must be a non-empty string`)
      }
    }
  }

  if (issues.length > 0) {
    throw new Error(`Invalid QA Review:\n- ${issues.join('\n- ')}`)
  }

  return value as unknown as QaReviewArtifact
}

export function buildQaReport(
  evidence: QaEvidencePack,
  review: QaReviewArtifact,
  options: { id?: string; createdAt?: string } = {},
): QaReport {
  const findings = [
    ...evidence.structuralFindings.map((finding) =>
      structuredClone(finding),
    ),
    ...review.findings.map((finding) => structuredClone(finding)),
  ]
  const blockingFindingIds = findings
    .filter((finding) => finding.severity === 'error')
    .map((finding) => finding.id)

  return {
    schemaVersion: 1,
    id: options.id ?? `report-${evidence.id}`,
    projectId: evidence.projectId,
    evidenceId: evidence.id,
    renderId: evidence.renderId,
    createdAt: options.createdAt ?? new Date().toISOString(),
    findings,
    blockingFindingIds,
    status: blockingFindingIds.length === 0 ? 'pass' : 'fail',
  }
}

export function assertQaReportPasses(report: QaReport): void {
  if (report.status !== 'pass' || report.blockingFindingIds.length > 0) {
    throw new Error(
      `QA report "${report.id}" has ${report.blockingFindingIds.length} blocking finding(s)`,
    )
  }
}

function validateSceneTimeline(
  scenes: readonly SceneIR[],
  durationMs: number,
  add: (sceneId: string, message: string) => void,
): void {
  if (scenes.length === 0) {
    add('__video__', 'No Scene IR exists for the rendered project.')
    return
  }

  if (scenes[0]!.startMs !== 0) {
    add(scenes[0]!.id, 'First effective scene does not start at 0ms.')
  }

  for (let index = 0; index < scenes.length; index += 1) {
    const scene = scenes[index]!
    if (scene.durationMs <= 0) {
      add(scene.id, 'Effective scene duration is not positive.')
    }
    if (index > 0) {
      const previous = scenes[index - 1]!
      const expected = previous.startMs + previous.durationMs
      if (scene.startMs !== expected) {
        add(
          scene.id,
          `Effective scene starts at ${scene.startMs}ms instead of previous boundary ${expected}ms.`,
        )
      }
    }
  }

  const last = scenes.at(-1)!
  const end = last.startMs + last.durationMs
  if (end !== durationMs) {
    add(
      last.id,
      `Effective scene timeline ends at ${end}ms instead of alignment duration ${durationMs}ms.`,
    )
  }
}

function groupPlans(
  plans: readonly FrameSamplePlan[],
): Map<string, FrameSamplePlan[]> {
  const result = new Map<string, FrameSamplePlan[]>()
  for (const plan of plans) {
    const list = result.get(plan.sceneId) ?? []
    list.push(plan)
    result.set(plan.sceneId, list)
  }
  return result
}

function commandAvailable(command: string, args: string[]): boolean {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  return result.error === undefined && result.status === 0
}

function probeDurationMs(binary: string, path: string): number {
  const result = spawnSync(
    binary,
    [
      '-v',
      'error',
      '-show_entries',
      'format=duration',
      '-of',
      'default=noprint_wrappers=1:nokey=1',
      path,
    ],
    {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  )
  if (result.error !== undefined || result.status !== 0) {
    throw new Error(result.stderr || result.stdout || 'ffprobe failed')
  }
  const seconds = Number(result.stdout.trim())
  if (!Number.isFinite(seconds) || seconds <= 0) {
    throw new Error(`invalid ffprobe duration "${result.stdout.trim()}"`)
  }
  return seconds * 1000
}

function extractFrame(
  binary: string,
  videoPath: string,
  timeMs: number,
  outputPath: string,
): void {
  const result = spawnSync(
    binary,
    [
      '-hide_banner',
      '-loglevel',
      'error',
      '-y',
      '-i',
      videoPath,
      '-ss',
      (timeMs / 1000).toFixed(3),
      '-frames:v',
      '1',
      '-vf',
      "scale='min(1280,iw)':-2",
      outputPath,
    ],
    {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 16 * 1024 * 1024,
    },
  )
  if (result.error !== undefined || result.status !== 0) {
    throw new Error(result.stderr || result.stdout || 'ffmpeg failed')
  }
}

function sampleId(sceneId: string, progress: number): string {
  return `${sceneId}:${String(Math.round(progress * 1000)).padStart(4, '0')}`
}

function safeName(value: string): string {
  const result = value.replace(/[^a-zA-Z0-9._-]+/g, '-')
  return result.length > 0 ? result : 'scene'
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function requireString(
  value: unknown,
  path: string,
  issues: string[],
): void {
  if (typeof value !== 'string' || value.trim().length === 0) {
    issues.push(`${path} must be a non-empty string`)
  }
}
