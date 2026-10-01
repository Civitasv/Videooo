import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type {
  QaRepairOverlay,
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

describe('ProjectStore M5 repair history', () => {
  it('allocates and loads immutable repair overlays', async () => {
    const root = await mkdtemp(join(tmpdir(), 'videooo-m5-repair-'))
    roots.push(root)
    const store = new ProjectStore(root)
    await store.initialize(project())

    expect(await store.nextQaRepairId()).toBe('repair-001')
    await store.saveQaRepair(repair('repair-001'))
    expect(await store.nextQaRepairId()).toBe('repair-002')
    await store.saveQaRepair(repair('repair-002'))

    expect(
      (await store.loadQaRepairs(['repair-001', 'repair-002'])).map(
        (item) => item.id,
      ),
    ).toEqual(['repair-001', 'repair-002'])
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
  }
}

function repair(id: string): QaRepairOverlay {
  return {
    schemaVersion: 1,
    id,
    projectId: 'project',
    qaReportId: 'report',
    createdAt: '2026-10-02T00:00:00.000Z',
    sceneRepairs: [
      {
        sceneId: 'scene',
        findingIds: ['finding'],
        transition: 'cut',
      },
    ],
  }
}
