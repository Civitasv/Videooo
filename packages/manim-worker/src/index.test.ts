import { describe, expect, it } from 'vitest'
import type { SceneIR, VideoFormat, VideoStyle } from '@videooo/domain'
import {
  generateManimSource,
  manimSceneCacheKey,
  parseManimVersion,
} from './index.js'

const style: VideoStyle = {
  schemaVersion: 1,
  id: 'style',
  background: '#000000',
  surface: '#111111',
  foreground: '#ffffff',
  muted: '#999999',
  accent: '#ff8800',
  accentSoft: '#332211',
  fontFamily: 'sans-serif',
  monoFontFamily: 'monospace',
  safeAreaPx: 80,
  radiusPx: 20,
}

const video: VideoFormat = { width: 1920, height: 1080, fps: 30 }

describe('Manim worker', () => {
  it('parses Manim 0.21 version output', () => {
    expect(parseManimVersion('Manim Community v0.21.0')).toBe('0.21.0')
  })

  it('generates deterministic fixed Python for equation scenes', () => {
    const scene = equationScene()
    const first = generateManimSource(scene, style, video)
    const second = generateManimSource(scene, style, video)

    expect(first).toBe(second)
    expect(first).toContain('class VideoooScene(Scene)')
    expect(first).toContain('render_equation')
    expect(first).not.toContain('subprocess')
    expect(first).not.toContain('requests')
  })

  it('changes cache key when scene content changes', () => {
    const first = equationScene()
    const second = structuredClone(first)
    if (second.content.type !== 'equation') throw new Error('wrong fixture')
    second.content.steps.push('x=2')

    expect(manimSceneCacheKey(first, style, video, '0.21.0')).not.toBe(
      manimSceneCacheKey(second, style, video, '0.21.0'),
    )
  })
})

function equationScene(): SceneIR {
  return {
    schemaVersion: 1,
    id: 'equation',
    projectId: 'project',
    storyboardId: 'storyboard',
    startMs: 0,
    durationMs: 3000,
    sectionIds: ['s1'],
    teachingGoal: 'Show equation transformation',
    renderer: 'manim',
    visualKind: 'equation',
    content: {
      type: 'equation',
      steps: ['x+1=2', 'x=1'],
    },
    transition: 'fade',
  }
}
