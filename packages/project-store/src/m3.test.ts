import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type {
  SceneIR,
  StoryboardArtifact,
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

describe('ProjectStore M3', () => {
  it('persists storyboard and deterministic scene order', async () => {
    const root = await mkdtemp(join(tmpdir(), 'videooo-m3-store-'))
    roots.push(root)
    const store = new ProjectStore(root)
    await store.initialize(project())
    await store.saveStoryboard(storyboard())

    const scenes = [scene('a', 0), scene('b', 5000)]
    await store.saveScenes(scenes)

    expect(await store.loadStoryboard()).toEqual(storyboard())
    expect((await store.listScenes()).map((item) => item.id)).toEqual(['a', 'b'])
    expect((await store.loadScene('b')).startMs).toBe(5000)
  })
})

function project(): VideoProjectManifest {
  return {
    schemaVersion: 1,
    id: 'project',
    topic: 'Topic',
    stage: 'aligned',
    createdAt: '2026-10-02T00:00:00.000Z',
    updatedAt: '2026-10-02T00:00:00.000Z',
    alignmentId: 'alignment',
  }
}

function storyboard(): StoryboardArtifact {
  return {
    schemaVersion: 1,
    id: 'storyboard',
    projectId: 'project',
    alignmentId: 'alignment',
    createdAt: '2026-10-02T00:00:00.000Z',
    video: { width: 1920, height: 1080, fps: 30 },
    scenes: [
      {
        id: 'a',
        startMs: 0,
        endMs: 5000,
        sectionIds: ['s1'],
        teachingGoal: 'A',
        visualKind: 'title',
        direction: 'Show A.',
        content: { type: 'title', title: 'A' },
      },
      {
        id: 'b',
        startMs: 5000,
        endMs: 10000,
        sectionIds: ['s2'],
        teachingGoal: 'B',
        visualKind: 'summary',
        direction: 'Show B.',
        content: { type: 'summary', title: 'B', bullets: ['B'] },
      },
    ],
  }
}

function scene(id: string, startMs: number): SceneIR {
  return {
    schemaVersion: 1,
    id,
    projectId: 'project',
    storyboardId: 'storyboard',
    startMs,
    durationMs: 5000,
    sectionIds: [id === 'a' ? 's1' : 's2'],
    teachingGoal: id,
    renderer: 'remotion',
    visualKind: id === 'a' ? 'title' : 'summary',
    content:
      id === 'a'
        ? { type: 'title', title: 'A' }
        : { type: 'summary', title: 'B', bullets: ['B'] },
    transition: 'fade',
  }
}
