import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type {
  EstimatedTiming,
  PrevisRenderManifest,
  PrevisStoryboardArtifact,
  SceneIR,
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

describe('ProjectStore M5.5', () => {
  it('keeps previs artifacts isolated from production paths', async () => {
    const root = await mkdtemp(join(tmpdir(), 'videooo-previs-store-'))
    roots.push(root)
    const store = new ProjectStore(root)
    await store.initialize(project())

    await store.savePrevisTiming(timing())
    await store.savePrevisStoryboard(storyboard())
    await store.savePrevisScenes([scene()])
    await store.savePrevisRenderManifest(render())

    expect(await store.loadPrevisTiming()).toEqual(timing())
    expect(await store.loadPrevisStoryboard()).toEqual(storyboard())
    expect((await store.listPrevisScenes())[0]!.id).toBe('scene')
    expect(await store.loadPrevisRenderManifest()).toEqual(render())
    expect(await store.hasStoryboard()).toBe(false)
    expect(await store.listScenes()).toEqual([])
  })
})

function project(): VideoProjectManifest {
  return {
    schemaVersion: 1,
    id: 'project',
    topic: 'Topic',
    stage: 'approved',
    createdAt: '2026-10-02T00:00:00.000Z',
    updatedAt: '2026-10-02T00:00:00.000Z',
    approvedScriptVersionId: 'script',
  }
}

function timing(): EstimatedTiming {
  return {
    schemaVersion: 1,
    id: 'timing',
    projectId: 'project',
    scriptVersionId: 'script',
    createdAt: '2026-10-02T00:00:00.000Z',
    method: 'heuristic',
    durationMs: 1000,
    sections: [
      { sectionId: 's1', startMs: 0, endMs: 1000, durationMs: 1000 },
    ],
  }
}

function storyboard(): PrevisStoryboardArtifact {
  return {
    schemaVersion: 1,
    id: 'storyboard',
    projectId: 'project',
    timingId: 'timing',
    createdAt: '2026-10-02T00:00:00.000Z',
    video: { width: 1920, height: 1080, fps: 30 },
    scenes: [
      {
        id: 'scene',
        startMs: 0,
        endMs: 1000,
        sectionIds: ['s1'],
        teachingGoal: 'Explain',
        visualKind: 'title',
        direction: 'Show title',
        content: { type: 'title', title: 'Preview' },
      },
    ],
  }
}

function scene(): SceneIR {
  return {
    schemaVersion: 1,
    id: 'scene',
    projectId: 'project',
    storyboardId: 'storyboard',
    startMs: 0,
    durationMs: 1000,
    sectionIds: ['s1'],
    teachingGoal: 'Explain',
    renderer: 'remotion',
    visualKind: 'title',
    content: { type: 'title', title: 'Preview' },
    transition: 'fade',
    direction: 'Show title',
  }
}

function render(): PrevisRenderManifest {
  return {
    schemaVersion: 1,
    id: 'previs-render',
    projectId: 'project',
    storyboardId: 'storyboard',
    timingId: 'timing',
    createdAt: '2026-10-02T00:00:00.000Z',
    renderer: 'remotion',
    outputPath: 'previs/renders/preview.mp4',
    width: 1920,
    height: 1080,
    fps: 30,
    durationMs: 1000,
    codec: 'h264',
  }
}
