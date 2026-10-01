import { describe, expect, it } from 'vitest'
import { routeVisualKind, validateM4SceneContent } from './index.js'

describe('visual router', () => {
  it.each(['title', 'typography', 'code', 'diagram', 'summary'] as const)(
    'routes %s to Remotion',
    (kind) => {
      expect(routeVisualKind(kind)).toBe('remotion')
    },
  )

  it.each(['equation', 'plot', 'vector', 'algorithm'] as const)(
    'routes %s to Manim',
    (kind) => {
      expect(routeVisualKind(kind)).toBe('manim')
    },
  )

  it('validates Manim declarative content', () => {
    expect(
      validateM4SceneContent('equation', {
        type: 'equation',
        steps: [],
      }),
    ).toContain('equation requires at least one step')
  })
})
