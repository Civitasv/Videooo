import { mkdtemp, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { renderRemotionVideo } from '../packages/renderer-remotion/.build/index.js'

const root = await mkdtemp(join(tmpdir(), 'videooo-remotion-smoke-'))

try {
  const audio = join(root, 'narration.wav')
  const output = join(root, 'smoke.mp4')
  await writeFile(audio, silentWav({ durationMs: 1000, sampleRate: 16000 }))

  const scenes = [
    {
      schemaVersion: 1,
      id: 'title',
      projectId: 'smoke',
      storyboardId: 'storyboard',
      startMs: 0,
      durationMs: 500,
      sectionIds: ['s1'],
      teachingGoal: 'Open the video',
      renderer: 'remotion',
      visualKind: 'title',
      content: {
        type: 'title',
        eyebrow: 'Videooo',
        title: 'Render smoke',
        subtitle: 'Real Remotion pipeline',
      },
      transition: 'fade',
    },
    {
      schemaVersion: 1,
      id: 'summary',
      projectId: 'smoke',
      storyboardId: 'storyboard',
      startMs: 500,
      durationMs: 500,
      sectionIds: ['s2'],
      teachingGoal: 'End the smoke video',
      renderer: 'remotion',
      visualKind: 'summary',
      content: {
        type: 'summary',
        title: 'Pipeline',
        bullets: ['bundle', 'selectComposition', 'renderMedia'],
      },
      transition: 'cut',
    },
  ]

  const result = await renderRemotionVideo({
    scenes,
    style: {
      schemaVersion: 1,
      id: 'smoke-style',
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
    },
    video: { width: 640, height: 360, fps: 10 },
    durationMs: 1000,
    narrationSourcePath: audio,
    workspaceDirectory: join(root, 'workspace'),
    outputLocation: output,
    logLevel: 'warn',
  })

  const info = await stat(output)
  if (!info.isFile() || info.size < 1000) {
    throw new Error(`Smoke output is unexpectedly small: ${info.size} bytes`)
  }

  console.log(
    `Remotion smoke rendered ${result.frameCount} frames / ${info.size} bytes.`,
  )
} finally {
  await rm(root, { recursive: true, force: true })
}

function silentWav({ durationMs, sampleRate }) {
  const samples = Math.ceil((durationMs / 1000) * sampleRate)
  const dataBytes = samples * 2
  const buffer = Buffer.alloc(44 + dataBytes)
  buffer.write('RIFF', 0)
  buffer.writeUInt32LE(36 + dataBytes, 4)
  buffer.write('WAVE', 8)
  buffer.write('fmt ', 12)
  buffer.writeUInt32LE(16, 16)
  buffer.writeUInt16LE(1, 20)
  buffer.writeUInt16LE(1, 22)
  buffer.writeUInt32LE(sampleRate, 24)
  buffer.writeUInt32LE(sampleRate * 2, 28)
  buffer.writeUInt16LE(2, 32)
  buffer.writeUInt16LE(16, 34)
  buffer.write('data', 36)
  buffer.writeUInt32LE(dataBytes, 40)
  return buffer
}
