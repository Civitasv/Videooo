import type {
  M4VisualKind,
  RendererKind,
  SceneContent,
} from '@videooo/domain'

const remotionKinds = new Set<M4VisualKind>([
  'title',
  'typography',
  'code',
  'diagram',
  'summary',
])

const manimKinds = new Set<M4VisualKind>([
  'equation',
  'plot',
  'vector',
  'algorithm',
])

export function routeVisualKind(kind: M4VisualKind): RendererKind {
  if (remotionKinds.has(kind)) return 'remotion'
  if (manimKinds.has(kind)) return 'manim'
  throw new Error(`Unsupported visual kind: ${String(kind)}`)
}

export function validateM4SceneContent(
  kind: M4VisualKind,
  content: SceneContent,
): string[] {
  const issues: string[] = []

  if (content.type !== kind) {
    issues.push(`content.type must match visualKind "${kind}"`)
    return issues
  }

  switch (content.type) {
    case 'equation':
      if (content.steps.length === 0) {
        issues.push('equation requires at least one step')
      }
      if (content.steps.some((step) => step.trim().length === 0)) {
        issues.push('equation steps must be non-empty')
      }
      if (
        content.annotations !== undefined &&
        content.annotations.length > content.steps.length
      ) {
        issues.push('equation annotations cannot outnumber steps')
      }
      break
    case 'plot':
      validateRange(content.xRange, 'xRange', issues)
      validateRange(content.yRange, 'yRange', issues)
      if (content.series.length === 0) {
        issues.push('plot requires at least one series')
      }
      for (const series of content.series) {
        if (series.id.trim().length === 0) {
          issues.push('plot series id must be non-empty')
        }
        if (series.points.length < 2) {
          issues.push(`plot series "${series.id}" needs at least two points`)
        }
        for (const point of series.points) {
          if (
            point.length !== 2 ||
            !Number.isFinite(point[0]) ||
            !Number.isFinite(point[1])
          ) {
            issues.push(`plot series "${series.id}" has invalid point`)
          }
        }
      }
      break
    case 'vector':
      if (content.vectors.length === 0) {
        issues.push('vector scene requires at least one vector')
      }
      if (content.xRange !== undefined) {
        validateRange(content.xRange, 'xRange', issues)
      }
      if (content.yRange !== undefined) {
        validateRange(content.yRange, 'yRange', issues)
      }
      for (const vector of content.vectors) {
        if (vector.id.trim().length === 0) {
          issues.push('vector id must be non-empty')
        }
        validatePoint(vector.from, `vector "${vector.id}" from`, issues)
        validatePoint(vector.to, `vector "${vector.id}" to`, issues)
      }
      break
    case 'algorithm':
      if (content.states.length === 0) {
        issues.push('algorithm scene requires at least one state')
      }
      for (const [index, state] of content.states.entries()) {
        if (state.label.trim().length === 0) {
          issues.push(`algorithm state ${index + 1} label must be non-empty`)
        }
        if (state.values.length === 0) {
          issues.push(`algorithm state "${state.label}" needs values`)
        }
        if (
          state.activeIndices?.some(
            (active) =>
              !Number.isInteger(active) ||
              active < 0 ||
              active >= state.values.length,
          )
        ) {
          issues.push(
            `algorithm state "${state.label}" has invalid active index`,
          )
        }
      }
      break
    default:
      break
  }

  return issues
}

function validateRange(
  value: readonly [number, number],
  label: string,
  issues: string[],
): void {
  if (
    !Number.isFinite(value[0]) ||
    !Number.isFinite(value[1]) ||
    value[1] <= value[0]
  ) {
    issues.push(`${label} must be a finite increasing range`)
  }
}

function validatePoint(
  value: readonly [number, number],
  label: string,
  issues: string[],
): void {
  if (!Number.isFinite(value[0]) || !Number.isFinite(value[1])) {
    issues.push(`${label} must contain finite coordinates`)
  }
}
