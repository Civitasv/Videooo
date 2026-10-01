import type {
  NarrationAlignment,
  SceneFramePlan,
  SceneIR,
  StoryboardArtifact,
  StoryboardScene,
  VideoProjectManifest,
  VideoStyle,
} from '@videooo/domain'

export const DEFAULT_VIDEO_STYLE: VideoStyle = {
  schemaVersion: 1,
  id: 'videooo-default-v1',
  background: '#0B0D12',
  surface: '#151923',
  foreground: '#F7F8FA',
  muted: '#A7AFBD',
  accent: '#FF8A3D',
  accentSoft: '#3A2418',
  fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
  monoFontFamily: 'SFMono-Regular, ui-monospace, monospace',
  safeAreaPx: 96,
  radiusPx: 28,
}

export function parseStoryboardArtifact(
  value: unknown,
  project: VideoProjectManifest,
  alignment: NarrationAlignment,
): StoryboardArtifact {
  if (!isRecord(value)) {
    throw new Error('Invalid Storyboard: artifact must be a JSON object')
  }

  const storyboard = value as unknown as StoryboardArtifact
  const issues = validateStoryboard(storyboard, project, alignment)
  if (issues.length > 0) {
    throw new Error(`Invalid Storyboard:\n- ${issues.join('\n- ')}`)
  }
  return storyboard
}

export function validateStoryboard(
  storyboard: StoryboardArtifact,
  project: VideoProjectManifest,
  alignment: NarrationAlignment,
): string[] {
  const issues: string[] = []

  if (storyboard.schemaVersion !== 1) issues.push('schemaVersion must be 1')
  if (storyboard.projectId !== project.id) {
    issues.push(`projectId must be "${project.id}"`)
  }
  if (storyboard.alignmentId !== alignment.id) {
    issues.push(`alignmentId must be "${alignment.id}"`)
  }
  if (!nonEmpty(storyboard.id)) issues.push('id must be non-empty')
  if (!nonEmpty(storyboard.createdAt)) issues.push('createdAt must be non-empty')

  const video = storyboard.video
  if (
    video === undefined ||
    !Number.isInteger(video.width) ||
    video.width <= 0 ||
    !Number.isInteger(video.height) ||
    video.height <= 0 ||
    !Number.isFinite(video.fps) ||
    video.fps <= 0 ||
    video.fps > 120
  ) {
    issues.push('video must define positive width/height and fps <= 120')
  }

  if (!Array.isArray(storyboard.scenes) || storyboard.scenes.length === 0) {
    issues.push('scenes must contain at least one scene')
    return issues
  }

  const validSections = new Set(alignment.sections.map((section) => section.sectionId))
  const sceneIds = new Set<string>()

  for (const [index, scene] of storyboard.scenes.entries()) {
    validateScene(scene, index, validSections, sceneIds, issues)

    if (index === 0 && scene.startMs !== 0) {
      issues.push('first scene must start at 0ms')
    }
    if (index > 0) {
      const previous = storyboard.scenes[index - 1]!
      if (scene.startMs !== previous.endMs) {
        issues.push(
          `scene "${scene.id}" must start exactly at previous end ${previous.endMs}ms`,
        )
      }
    }
  }

  const last = storyboard.scenes.at(-1)!
  if (last.endMs !== alignment.durationMs) {
    issues.push(
      `final scene must end at alignment duration ${alignment.durationMs}ms`,
    )
  }

  return issues
}

export function compileStoryboard(
  storyboard: StoryboardArtifact,
): SceneIR[] {
  return storyboard.scenes.map((scene) => ({
    schemaVersion: 1,
    id: scene.id,
    projectId: storyboard.projectId,
    storyboardId: storyboard.id,
    startMs: scene.startMs,
    durationMs: scene.endMs - scene.startMs,
    sectionIds: [...scene.sectionIds],
    teachingGoal: scene.teachingGoal,
    renderer: 'remotion',
    visualKind: scene.visualKind,
    content: structuredClone(scene.content),
    transition: scene.transition ?? 'fade',
  }))
}

export function planSceneFrames(
  scenes: readonly SceneIR[],
  fps: number,
  durationMs: number,
): SceneFramePlan[] {
  if (scenes.length === 0) return []
  const finalFrame = Math.max(1, Math.ceil((durationMs / 1000) * fps))
  const boundaries = [0]

  for (let index = 1; index < scenes.length; index += 1) {
    boundaries.push(Math.round((scenes[index]!.startMs / 1000) * fps))
  }
  boundaries.push(finalFrame)

  return scenes.map((scene, index) => {
    const from = boundaries[index]!
    const to = boundaries[index + 1]!
    if (to <= from) {
      throw new Error(
        `Scene "${scene.id}" is too short for ${fps}fps frame planning`,
      )
    }
    return {
      sceneId: scene.id,
      from,
      durationInFrames: to - from,
    }
  })
}

function validateScene(
  scene: StoryboardScene,
  index: number,
  validSections: ReadonlySet<string>,
  sceneIds: Set<string>,
  issues: string[],
): void {
  const label = nonEmpty(scene.id) ? scene.id : `scene[${index}]`
  if (!nonEmpty(scene.id)) issues.push(`scene[${index}].id must be non-empty`)
  if (sceneIds.has(scene.id)) issues.push(`duplicate scene id "${scene.id}"`)
  sceneIds.add(scene.id)

  if (
    !Number.isFinite(scene.startMs) ||
    !Number.isFinite(scene.endMs) ||
    scene.startMs < 0 ||
    scene.endMs <= scene.startMs
  ) {
    issues.push(`scene "${label}" must have positive finite timing`)
  }
  if (!nonEmpty(scene.teachingGoal)) {
    issues.push(`scene "${label}" teachingGoal must be non-empty`)
  }
  if (!nonEmpty(scene.direction)) {
    issues.push(`scene "${label}" direction must be non-empty`)
  }
  if (!Array.isArray(scene.sectionIds) || scene.sectionIds.length === 0) {
    issues.push(`scene "${label}" must reference at least one section`)
  } else {
    for (const sectionId of scene.sectionIds) {
      if (!validSections.has(sectionId)) {
        issues.push(
          `scene "${label}" references unknown section "${sectionId}"`,
        )
      }
    }
  }

  const allowed = new Set(['title', 'typography', 'code', 'diagram', 'summary'])
  if (!allowed.has(scene.visualKind)) {
    issues.push(`scene "${label}" visualKind is unsupported in M3`)
  }
  if (
    scene.transition !== undefined &&
    scene.transition !== 'cut' &&
    scene.transition !== 'fade' &&
    scene.transition !== 'slide'
  ) {
    issues.push(`scene "${label}" transition is invalid`)
  }

  validateContent(scene, label, issues)
}

function validateContent(
  scene: StoryboardScene,
  label: string,
  issues: string[],
): void {
  const content = scene.content
  if (!isRecord(content)) {
    issues.push(`scene "${label}" content must be an object`)
    return
  }
  if (content.type !== scene.visualKind) {
    issues.push(
      `scene "${label}" content.type must match visualKind "${scene.visualKind}"`,
    )
    return
  }

  switch (content.type) {
    case 'title':
      requireText(content.title, label, 'title', issues)
      break
    case 'typography':
      requireText(content.headline, label, 'headline', issues)
      break
    case 'code':
      requireText(content.code, label, 'code', issues)
      if (content.highlightedLines !== undefined) {
        if (!Array.isArray(content.highlightedLines)) {
          issues.push(`scene "${label}" highlightedLines must be an array`)
        } else {
          const lineCount = content.code.split('\n').length
          for (const line of content.highlightedLines) {
            if (!Number.isInteger(line) || line < 1 || line > lineCount) {
              issues.push(
                `scene "${label}" highlighted code line "${String(line)}" is invalid`,
              )
            }
          }
        }
      }
      break
    case 'diagram': {
      if (!Array.isArray(content.nodes) || content.nodes.length === 0) {
        issues.push(`scene "${label}" diagram needs nodes`)
        break
      }
      const ids = new Set<string>()
      for (const node of content.nodes) {
        if (!nonEmpty(node.id) || !nonEmpty(node.label)) {
          issues.push(`scene "${label}" diagram node id/label must be non-empty`)
        }
        if (ids.has(node.id)) {
          issues.push(`scene "${label}" duplicate diagram node "${node.id}"`)
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
          issues.push(
            `scene "${label}" diagram node "${node.id}" coordinates must be 0..1`,
          )
        }
      }
      if (!Array.isArray(content.edges)) {
        issues.push(`scene "${label}" diagram edges must be an array`)
      } else {
        for (const edge of content.edges) {
          if (!ids.has(edge.from) || !ids.has(edge.to)) {
            issues.push(
              `scene "${label}" diagram edge "${edge.from}->${edge.to}" references unknown node`,
            )
          }
        }
      }
      break
    }
    case 'summary':
      requireText(content.title, label, 'title', issues)
      if (
        !Array.isArray(content.bullets) ||
        content.bullets.length === 0 ||
        content.bullets.some((bullet) => !nonEmpty(bullet))
      ) {
        issues.push(`scene "${label}" summary bullets must be non-empty`)
      }
      break
    default:
      issues.push(`scene "${label}" content type is unsupported`)
  }
}

function requireText(
  value: unknown,
  scene: string,
  field: string,
  issues: string[],
): void {
  if (!nonEmpty(value)) {
    issues.push(`scene "${scene}" ${field} must be non-empty`)
  }
}

function nonEmpty(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
