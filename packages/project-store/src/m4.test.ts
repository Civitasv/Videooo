import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { SceneRenderAsset, VideoProjectManifest } from '@videooo/domain'
import { ProjectStore } from './index.js'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) =>
      rm(root, { recursive: true, force: true }),
    ),
  )
})

describe('ProjectStore M4', () => {
  it('upserts Manim render assets by scene id', async () => {
    const root = await mkdtemp(join(tmpdir(), 'videooo-m4-store-'))
    roots.push(root)
    const store = new ProjectStore(root)
    await store.initialize(project())

    await store.saveSceneRenderAsset(asset('a', 'key-1'))
    await store.saveSceneRenderAsset(asset('b', 'key-2'))
    await store.saveSceneRenderAsset(asset('a', 'key-3'))

    const index = await store.loadSceneRenderIndex()
    expect(index.assets).toHaveLength(2)
    expect(await store.loadSceneRenderAsset('a')).toMatchObject({
      cacheKey: 'key-3',
    })
  })
})

function project(): VideoProjectManifest {
  return {
    schemaVersion: 1,
    id: 'project',
    topic: 'Topic',
    stage: 'storyboarded',
    createdAt: '2026-10-02T00:00:00.000Z',
    updatedAt: '2026-10-02T00:00:00.000Z',
  }
}

function asset(sceneId: string, cacheKey: string): SceneRenderAsset {
  return {
    schemaVersion: 1,
    sceneId,
    renderer: 'manim',
    fileName: `${sceneId}.mp4`,
    cacheKey,
    manimVersion: '0.21.0',
    durationMs: 1000,
    width: 1920,
    height: 1080,
    fps: 30,
  }
}
