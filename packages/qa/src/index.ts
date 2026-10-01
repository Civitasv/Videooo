import { spawnSync } from 'node:child_process'
import { mkdir, stat } from 'node:fs/promises'
import { resolve } from 'node:path'
import type {
  M4VisualKind,
  NarrationAlignment,
  QaEvidencePack,
  QaFinding,
  QaFrameSample,
  QaRepairOverlay,
  QaReport,
  QaReviewArtifact,
  QaSceneEvidence,
  SceneContent,
  SceneIR,
  SceneRenderAsset,
  ScriptVersion,
  VideoProjectManifest,
  VideoRenderManifest,
} from '@videooo/domain'
import {
  routeVisualKind,
  validateM4SceneContent,
} from '@videooo/visual-router'

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

export function parseQaRepairOverlay(
  value: unknown,
  project: VideoProjectManifest,
  report: QaReport,
  baseScenes: readonly SceneIR[],
): QaRepairOverlay {
  if (!isRecord(value)) {
    throw new Error('Invalid QA Repair: artifact must be a JSON object')
  }

  const issues: string[] = []
  if (value.schemaVersion !== 1) issues.push('schemaVersion must be 1')
  requireString(value.id, 'id', issues)
  requireString(value.projectId, 'projectId', issues)
  requireString(value.qaReportId, 'qaReportId', issues)
  requireString(value.createdAt, 'createdAt', issues)

  if (value.projectId !== project.id) {
    issues.push(`projectId must be "${project.id}"`)
  }
  if (value.qaReportId !== report.id) {
    issues.push(`qaReportId must be "${report.id}"`)
  }
  if (report.status !== 'fail') {
    issues.push('repairs require a failing QA report')
  }

  const scenes = new Map(baseScenes.map((scene) => [scene.id, scene]))
  const findings = new Map(report.findings.map((finding) => [finding.id, finding]))
  const blocking = new Set(report.blockingFindingIds)
  const repairedScenes = new Set<string>()

  if (!Array.isArray(value.sceneRepairs) || value.sceneRepairs.length === 0) {
    issues.push('sceneRepairs must contain at least one repair')
  } else {
    for (const [index, raw] of value.sceneRepairs.entries()) {
      const path = `sceneRepairs[${index}]`
      if (!isRecord(raw)) {
        issues.push(`${path} must be an object`)
        continue
      }

      requireString(raw.sceneId, `${path}.sceneId`, issues)
      if (typeof raw.sceneId !== 'string') continue
      const scene = scenes.get(raw.sceneId)
      if (scene === undefined) {
        issues.push(`${path}.sceneId references unknown scene "${raw.sceneId}"`)
        continue
      }
      if (repairedScenes.has(raw.sceneId)) {
        issues.push(`duplicate repair for scene "${raw.sceneId}"`)
      }
      repairedScenes.add(raw.sceneId)

      if (!Array.isArray(raw.findingIds) || raw.findingIds.length === 0) {
        issues.push(`${path}.findingIds must contain blocking finding IDs`)
      } else {
        for (const findingId of raw.findingIds) {
          if (typeof findingId !== 'string' || !blocking.has(findingId)) {
            issues.push(
              `${path}.findingIds references non-blocking finding "${String(findingId)}"`,
            )
            continue
          }
          const finding = findings.get(findingId)
          if (
            finding !== undefined &&
            finding.sceneId !== raw.sceneId &&
            finding.sceneId !== '__video__'
          ) {
            issues.push(
              `${path}.finding "${findingId}" belongs to scene "${finding.sceneId}"`,
            )
          }
        }
      }

      const hasMutation =
        raw.visualKind !== undefined ||
        raw.content !== undefined ||
        raw.transition !== undefined ||
        raw.direction !== undefined
      if (!hasMutation) {
        issues.push(`${path} does not change any visual field`)
      }

      let kind = scene.visualKind
      if (raw.visualKind !== undefined) {
        if (!isVisualKind(raw.visualKind)) {
          issues.push(`${path}.visualKind is unsupported`)
        } else {
          kind = raw.visualKind
        }
      }

      if (
        raw.transition !== undefined &&
        raw.transition !== 'cut' &&
        raw.transition !== 'fade' &&
        raw.transition !== 'slide'
      ) {
        issues.push(`${path}.transition is invalid`)
      }

      if (
        raw.direction !== undefined &&
        (typeof raw.direction !== 'string' ||
          raw.direction.trim().length === 0)
      ) {
        issues.push(`${path}.direction must be a non-empty string`)
      }

      let content: SceneContent = scene.content
      if (raw.content !== undefined) {
        if (!isRecord(raw.content) || typeof raw.content.type !== 'string') {
          issues.push(`${path}.content must be a scene content object`)
        } else {
          content = raw.content as unknown as SceneContent
        }
      }

      if (
        raw.visualKind !== undefined &&
        raw.content === undefined &&
        kind !== scene.visualKind
      ) {
        issues.push(
          `${path}.content is required when changing visualKind`,
        )
      }

      if (isVisualKind(kind)) {
        for (const issue of validateRepairContent(kind, content)) {
          issues.push(`${path}.content ${issue}`)
        }
      }
    }
  }

  if (issues.length > 0) {
    throw new Error(`Invalid QA Repair:\n- ${issues.join('\n- ')}`)
  }

  return value as unknown as QaRepairOverlay
}

export function applyQaRepairOverlays(
  baseScenes: readonly SceneIR[],
  overlays: readonly QaRepairOverlay[],
): SceneIR[] {
  const byId = new Map(
    baseScenes.map((scene) => [scene.id, structuredClone(scene)]),
  )

  for (const overlay of overlays) {
    for (const repair of overlay.sceneRepairs) {
      const current = byId.get(repair.sceneId)
      if (current === undefined) {
        throw new Error(
          `Repair "${overlay.id}" references missing scene "${repair.sceneId}"`,
        )
      }

      const visualKind = repair.visualKind ?? current.visualKind
      const content =
        repair.content === undefined
          ? current.content
          : structuredClone(repair.content)
      const next: SceneIR = {
        ...current,
        renderer: routeVisualKind(visualKind),
        visualKind,
        content,
        transition: repair.transition ?? current.transition,
        ...(repair.direction === undefined
          ? current.direction === undefined
            ? {}
            : { direction: current.direction }
          : { direction: repair.direction }),
      }
      byId.set(current.id, next)
    }
  }

  return baseScenes.map((scene) => {
    const effective = byId.get(scene.id)
    if (effective === undefined) {
      throw new Error(`Effective scene "${scene.id}" is missing`)
    }
    return effective
  })
}

function validateRepairContent(
  kind: M4VisualKind,
  content: SceneContent,
): string[] {
  const issues = [...validateM4SceneContent(kind, content)]
  if (content.type !== kind) return issues

  switch (content.type) {
    case 'title':
      if (content.title.trim().length === 0) {
        issues.push('title must be non-empty')
      }
      break
    case 'typography':
      if (content.headline.trim().length === 0) {
        issues.push('headline must be non-empty')
      }
      break
    case 'code':
      if (content.code.trim().length === 0) {
        issues.push('code must be non-empty')
      }
      break
    case 'diagram': {
      if (content.nodes.length === 0) {
        issues.push('diagram requires nodes')
        break
      }
      const ids = new Set<string>()
      for (const node of content.nodes) {
        if (node.id.trim().length === 0 || node.label.trim().length === 0) {
          issues.push('diagram node id/label must be non-empty')
        }
        if (ids.has(node.id)) {
          issues.push(`duplicate diagram node "${node.id}"`)
        }
        ids.add(node.id)
        if (
          !Number.isFinite(node.x) ||
          !Number.isFinite(node.y) ||
          node.x < 0 ||
          node.x > 1 ||
          node.y < 0 ||
          node.y > 1
        ) {
          issues.push(`diagram node "${node.id}" coordinates must be 0..1`)
        }
      }
      for (const edge of content.edges) {
        if (!ids.has(edge.from) || !ids.has(edge.to)) {
          issues.push(
            `diagram edge "${edge.from}->${edge.to}" references unknown node`,
          )
        }
      }
      break
    }
    case 'summary':
      if (
        content.title.trim().length === 0 ||
        content.bullets.length === 0 ||
        content.bullets.some((bullet) => bullet.trim().length === 0)
      ) {
        issues.push('summary title/bullets must be non-empty')
      }
      break
    default:
      break
  }

  return issues
}

function isVisualKind(value: unknown): value is M4VisualKind {
  return (
    value === 'title' ||
    value === 'typography' ||
    value === 'code' ||
    value === 'diagram' ||
    value === 'summary' ||
    value === 'equation' ||
    value === 'plot' ||
    value === 'vector' ||
    value === 'algorithm'
  )
}
