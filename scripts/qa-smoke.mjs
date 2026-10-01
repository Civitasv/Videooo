import { mkdtemp, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  assertQaReportPasses,
  buildQaReport,
  parseQaReviewArtifact,
  prepareQaEvidence,
} from '../packages/qa/.build/index.js'
import { renderRemotionVideo } from '../packages/renderer-remotion/.build/index.js'

const root = await mkdtemp(join(tmpdir(), 'videooo-qa-smoke-'))

try {
  const audio = join(root, 'narration.wav')
  const videoPath = join(root, 'draft.mp4')
  const framesDirectory = join(root, 'frames')
  await writeFile(audio, silentWav({ durationMs: 1000, sampleRate: 16000 }))

  const scene = {
    schemaVersion: 1,
    id: 'scene',
    projectId: 'project',
    storyboardId: 'storyboard',
    startMs: 0,
    durationMs: 1000,
    sectionIds: ['s1'],
    teachingGoal: 'Show a QA smoke title',
    renderer: 'remotion',
    visualKind: 'title',
    content: {
      type: 'title',
      title: 'Visual QA',
      subtitle: 'Evidence extraction smoke',
    },
    transition: 'cut',
    direction: 'Keep it simple.',
  }

  const style = {
    schemaVersion: 1,
    id: 'style',
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

  await renderRemotionVideo({
    scenes: [scene],
    style,
    video: { width: 640, height: 360, fps: 10 },
    durationMs: 1000,
    narrationSourcePath: audio,
    workspaceDirectory: join(root, 'workspace'),
    outputLocation: videoPath,
    logLevel: 'warn',
  })

  const project = {
    schemaVersion: 1,
    id: 'project',
    topic: 'QA smoke',
    stage: 'qa',
    createdAt: '2026-10-02T00:00:00.000Z',
    updatedAt: '2026-10-02T00:00:00.000Z',
    approvedScriptVersionId: 'script',
    alignmentId: 'alignment',
    storyboardId: 'storyboard',
    sceneCount: 1,
    renderId: 'render',
  }

  const render = {
    schemaVersion: 1,
    id: 'render',
    projectId: 'project',
    storyboardId: 'storyboard',
    alignmentId: 'alignment',
    createdAt: '2026-10-02T00:00:00.000Z',
    renderer: 'remotion',
    outputPath: 'renders/draft.mp4',
    width: 640,
    height: 360,
    fps: 10,
    durationMs: 1000,
    codec: 'h264',
  }

  const alignment = {
    schemaVersion: 1,
    id: 'alignment',
    projectId: 'project',
    narrationId: 'narration',
    scriptVersionId: 'script',
    transcriptId: 'transcript',
    createdAt: '2026-10-02T00:00:00.000Z',
    durationMs: 1000,
    coverage: 1,
    acceptedLowCoverage: false,
    scriptTokens: [],
    deviations: [],
    pauses: [],
    sections: [
      { sectionId: 's1', startMs: 0, endMs: 1000, coverage: 1 },
    ],
  }

  const script = {
    schemaVersion: 1,
    id: 'script',
    projectId: 'project',
    version: 1,
    researchPackId: 'research',
    createdAt: '2026-10-02T00:00:00.000Z',
    sections: [
      {
        id: 's1',
        purpose: 'QA smoke',
        narration: 'This is the QA smoke narration.',
        researchClaimIds: [],
        visualHints: [],
      },
    ],
  }

  const evidence = await prepareQaEvidence({
    project,
    render,
    alignment,
    script,
    scenes: [scene],
    sceneRenderAssets: [],
    manimAssetPaths: {},
    videoPath,
    videoPathLabel: 'renders/draft.mp4',
    framesDirectory,
    evidenceId: 'run-001',
    createdAt: '2026-10-02T00:00:00.000Z',
  })

  if (evidence.structuralFindings.length !== 0) {
    throw new Error(
      `QA smoke produced structural findings: ${JSON.stringify(evidence.structuralFindings)}`,
    )
  }
  if (evidence.scenes[0].frameSamples.length !== 3) {
    throw new Error(
      `Expected 3 evidence frames, got ${evidence.scenes[0].frameSamples.length}`,
    )
  }

  for (const frame of evidence.scenes[0].frameSamples) {
    const info = await stat(join(framesDirectory, frame.fileName))
    if (!info.isFile() || info.size <= 0) {
      throw new Error(`Evidence frame is empty: ${frame.fileName}`)
    }
  }

  const review = parseQaReviewArtifact(
    {
      schemaVersion: 1,
      id: 'review-001',
      projectId: 'project',
      evidenceId: 'run-001',
      createdAt: '2026-10-02T00:00:00.000Z',
      findings: [],
    },
    evidence,
  )
  const report = buildQaReport(evidence, review, {
    id: 'report-001',
    createdAt: '2026-10-02T00:00:00.000Z',
  })
  assertQaReportPasses(report)

  console.log(
    `QA smoke extracted ${evidence.scenes[0].frameSamples.length} frames and produced a passing report.`,
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
