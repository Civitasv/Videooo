import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type {
  NarrationAlignment,
  TranscriptArtifact,
  VideoProjectManifest,
} from '@videooo/domain'
import { ProjectStore } from './index.js'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) =>
      rm(root, { recursive: true, force: true }),
    ),
  )
})

describe('ProjectStore M2', () => {
  it('imports narration without modifying the source', async () => {
    const root = await makeRoot()
    const audio = join(root, 'voice.wav')
    await writeFile(audio, Buffer.from('fake-audio'))

    const store = new ProjectStore(root)
    await store.initialize(project())
    const asset = await store.importNarrationSource(audio, {
      projectId: 'project',
      scriptVersionId: 'script-1',
      importedAt: '2026-10-02T00:00:00.000Z',
    })

    expect(asset.byteLength).toBe(10)
    expect(asset.sha256).toHaveLength(64)
    expect(asset.storedFileName).toBe('source.wav')
    expect(await store.loadNarration()).toEqual(asset)
    expect(await readFile(audio, 'utf8')).toBe('fake-audio')
    expect(await readFile(store.narrationSourcePath(asset), 'utf8')).toBe(
      'fake-audio',
    )
  })

  it('stores transcript and replaceable alignment candidate', async () => {
    const root = await makeRoot()
    const store = new ProjectStore(root)
    await store.initialize(project())

    const transcript: TranscriptArtifact = {
      schemaVersion: 1,
      id: 'transcript-1',
      projectId: 'project',
      narrationId: 'narration-1',
      createdAt: '2026-10-02T00:00:00.000Z',
      provider: 'test',
      durationMs: 1000,
      text: 'hello',
      segments: [],
      tokens: [{ id: 't1', startMs: 0, endMs: 500, text: 'hello' }],
    }
    await store.saveTranscript(transcript)
    expect(await store.loadTranscript()).toEqual(transcript)

    const candidate = alignment(false)
    await store.saveAlignment(candidate)
    await expect(store.saveAlignment(candidate)).rejects.toThrow(
      'Alignment already exists',
    )

    const accepted = alignment(true)
    await store.saveAlignment(accepted, { replace: true })
    expect(await store.loadAlignment()).toEqual(accepted)
  })
})

async function makeRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'videooo-m2-store-'))
  roots.push(root)
  return root
}

function project(): VideoProjectManifest {
  return {
    schemaVersion: 1,
    id: 'project',
    topic: 'Topic',
    stage: 'approved',
    createdAt: '2026-10-02T00:00:00.000Z',
    updatedAt: '2026-10-02T00:00:00.000Z',
    approvedScriptVersionId: 'script-1',
  }
}

function alignment(acceptedLowCoverage: boolean): NarrationAlignment {
  return {
    schemaVersion: 1,
    id: 'alignment-1',
    projectId: 'project',
    narrationId: 'narration-1',
    scriptVersionId: 'script-1',
    transcriptId: 'transcript-1',
    createdAt: '2026-10-02T00:00:00.000Z',
    durationMs: 1000,
    coverage: 0.7,
    acceptedLowCoverage,
    scriptTokens: [],
    deviations: [],
    pauses: [],
    sections: [],
  }
}
