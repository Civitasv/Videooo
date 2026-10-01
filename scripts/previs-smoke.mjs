import { mkdtemp, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { renderRemotionVideo } from '../packages/renderer-remotion/.build/index.js'

const root = await mkdtemp(join(tmpdir(), 'videooo-previs-smoke-'))

try {
  const output = join(root, 'preview.mp4')

  const scenes = [
    {
      schemaVersion: 1,
      id: 'title',
      projectId: 'previs-smoke',
      storyboardId: 'previs-storyboard',
      startMs: 0,
      durationMs: 1000,
      sectionIds: ['s1'],
      teachingGoal: 'Show silent preview',
      renderer: 'remotion',
      visualKind: 'title',
      content: {
        type: 'title',
        eyebrow: 'Videooo Previs',
        title: 'No narration yet',
        subtitle: 'Visuals can still be reviewed.',
      },
      transition: 'fade',
      direction: 'Open with the preview premise.',
    },
  ]

  const style = {
    schemaVersion: 1,
    id: 'previs-style',
    background: '#0B0D12',
    surface: '#151923',
    foreground: '#F7F8FA',
    muted: '#A7AFBD',
    accent: '#FF8A3D',
    accentSoft: '#3A2418',
    fontFamily: 'Arial, sans-serif',
    monoFontFamily: 'monospace',
    safeAreaPx: 30,
    radiusPx: 12,
  }

  const result = await renderRemotionVideo({
    scenes,
    style,
    video: { width: 640, height: 360, fps: 10 },
    durationMs: 1000,
    workspaceDirectory: join(root, 'workspace'),
    outputLocation: output,
    logLevel: 'warn',
  })

  if (result.narrationFile !== null) {
    throw new Error('Previs smoke unexpectedly attached narration audio')
  }

  const info = await stat(output)
  if (!info.isFile() || info.size < 1000) {
    throw new Error(`Previs output is unexpectedly small: ${info.size} bytes`)
  }

  console.log(
    `Previs smoke rendered ${result.frameCount} silent frames / ${info.size} bytes.`,
  )
} finally {
  await rm(root, { recursive: true, force: true })
}
