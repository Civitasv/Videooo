import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type {
  QaEvidencePack,
  QaReport,
  QaReviewArtifact,
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

describe('ProjectStore M5', () => {
  it('allocates immutable QA runs and persists review/report', async () => {
    const root = await mkdtemp(join(tmpdir(), 'videooo-m5-store-'))
    roots.push(root)
    const store = new ProjectStore(root)
    await store.initialize(project())

    expect(await store.nextQaRunId()).toBe('run-001')
    await store.saveQaEvidence(evidence('run-001'))
    expect(await store.nextQaRunId()).toBe('run-002')

    const review: QaReviewArtifact = {
      schemaVersion: 1,
      id: 'review-1',
      projectId: 'project',
      evidenceId: 'run-001',
      createdAt: '2026-10-02T00:00:00.000Z',
      findings: [],
    }
    const report: QaReport = {
      schemaVersion: 1,
      id: 'report-run-001',
      projectId: 'project',
      evidenceId: 'run-001',
      renderId: 'render',
      createdAt: '2026-10-02T00:00:00.000Z',
      findings: [],
      blockingFindingIds: [],
      status: 'pass',
    }

    await store.saveQaReview('run-001', review)
    await store.saveQaReport('run-001', report)

    expect(await store.loadQaEvidence('run-001')).toEqual(evidence('run-001'))
    expect(await store.loadQaReview('run-001')).toEqual(review)
    expect(await store.loadQaReport('run-001')).toEqual(report)
  })

  it('copies an accepted draft to final.mp4', async () => {
    const root = await mkdtemp(join(tmpdir(), 'videooo-m5-final-'))
    roots.push(root)
    const store = new ProjectStore(root)
    await store.initialize(project())
    await writeFile(store.draftRenderPath, Buffer.from('video'))

    await store.acceptDraftAsFinal()
    expect(store.finalRenderPath.endsWith('final.mp4')).toBe(true)
  })
})

function project(): VideoProjectManifest {
  return {
    schemaVersion: 1,
    id: 'project',
    topic: 'Topic',
    stage: 'qa',
    createdAt: '2026-10-02T00:00:00.000Z',
    updatedAt: '2026-10-02T00:00:00.000Z',
    renderId: 'render',
  }
}

function evidence(id: string): QaEvidencePack {
  return {
    schemaVersion: 1,
    id,
    projectId: 'project',
    renderId: 'render',
    storyboardId: 'storyboard',
    alignmentId: 'alignment',
    createdAt: '2026-10-02T00:00:00.000Z',
    videoPath: 'renders/draft.mp4',
    durationMs: 1000,
    scenes: [],
    structuralFindings: [],
  }
}
