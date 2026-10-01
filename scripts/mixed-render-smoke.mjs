import { mkdtemp, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ManimWorker } from '../packages/manim-worker/.build/index.js'
import { renderRemotionVideo } from '../packages/renderer-remotion/.build/index.js'

const root = await mkdtemp(join(tmpdir(), 'videooo-mixed-smoke-'))

try {
  const audio = join(root, 'narration.wav')
  const output = join(root, 'mixed.mp4')
  const sceneOutput = join(root, 'scene-renders')
  await writeFile(audio, silentWav({ durationMs: 2000, sampleRate: 16000 }))

  const style = {
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
  }

  const video = { width: 640, height: 360, fps: 10 }

  const scenes = [
    {
      schemaVersion: 1,
      id: 'title',
      projectId: 'smoke',
      storyboardId: 'storyboard',
      startMs: 0,
      durationMs: 1000,
      sectionIds: ['s1'],
      teachingGoal: 'Open the mixed renderer smoke test',
      renderer: 'remotion',
      visualKind: 'title',
      content: {
        type: 'title',
        eyebrow: 'Videooo M4',
        title: 'Mixed renderer',
      },
      transition: 'cut',
    },
    {
      schemaVersion: 1,
      id: 'vector',
      projectId: 'smoke',
      storyboardId: 'storyboard',
      startMs: 1000,
      durationMs: 1000,
      sectionIds: ['s2'],
      teachingGoal: 'Show a Manim vector',
      renderer: 'manim',
      visualKind: 'vector',
      content: {
        type: 'vector',
        title: 'Vector',
        vectors: [
          {
            id: 'v',
            label: 'v',
            from: [0, 0],
            to: [2, 1],
          },
        ],
        xRange: [-3, 3],
        yRange: [-2, 2],
      },
      transition: 'cut',
    },
  ]

  const worker = new ManimWorker()
  const asset = await worker.render({
    scene: scenes[1],
    style,
    video,
    generatedDirectory: join(root, 'manim-generated'),
    mediaDirectory: join(root, 'manim-media'),
    outputDirectory: sceneOutput,
  })

  const manimPath = join(sceneOutput, asset.fileName)
  const manimStat = await stat(manimPath)
  if (manimStat.size < 1000) {
    throw new Error(`Manim smoke output too small: ${manimStat.size}`)
  }

  const result = await renderRemotionVideo({
    scenes,
    style,
    video,
    durationMs: 2000,
    narrationSourcePath: audio,
    workspaceDirectory: join(root, 'remotion-workspace'),
    outputLocation: output,
    manimSceneAssets: { vector: manimPath },
    logLevel: 'warn',
  })

  const finalStat = await stat(output)
  if (!finalStat.isFile() || finalStat.size < 1000) {
    throw new Error(`Mixed final output too small: ${finalStat.size}`)
  }

  console.log(
    `Mixed smoke: Manim ${manimStat.size} bytes -> Remotion ${result.frameCount} frames / ${finalStat.size} bytes.`,
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
