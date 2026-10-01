import { describe, expect, it } from 'vitest'
import type {
  NarrationAlignment,
  StoryboardArtifact,
  VideoProjectManifest,
} from '@videooo/domain'
import {
  compileStoryboard,
  parseStoryboardArtifact,
  planSceneFrames,
} from './index.js'

describe('storyboard validation and compilation', () => {
  it('accepts a contiguous grounded storyboard', () => {
    const board = storyboard()
    expect(parseStoryboardArtifact(board, project(), alignment())).toEqual(board)
    expect(compileStoryboard(board)).toHaveLength(2)
  })

  it('rejects gaps and wrong final boundary', () => {
    const board = storyboard()
    board.scenes[1]!.startMs = 5100
    board.scenes[1]!.endMs = 9900

    expect(() =>
      parseStoryboardArtifact(board, project(), alignment()),
    ).toThrow('must start exactly at previous end')
    expect(() =>
      parseStoryboardArtifact(board, project(), alignment()),
    ).toThrow('final scene must end')
  })

  it('rejects diagram edges targeting unknown nodes', () => {
    const board = storyboard()
    board.scenes[1] = {
      id: 'diagram',
      startMs: 5000,
      endMs: 10000,
      sectionIds: ['s2'],
      teachingGoal: 'Show relationship',
      visualKind: 'diagram',
      direction: 'Show two related concepts.',
      content: {
        type: 'diagram',
        nodes: [{ id: 'a', label: 'A', x: 0.2, y: 0.5 }],
        edges: [{ from: 'a', to: 'missing' }],
      },
    }

    expect(() =>
      parseStoryboardArtifact(board, project(), alignment()),
    ).toThrow('references unknown node')
  })

  it('plans contiguous frames from shared boundaries', () => {
    const scenes = compileStoryboard(storyboard())
    expect(planSceneFrames(scenes, 30, 10000)).toEqual([
      { sceneId: 'one', from: 0, durationInFrames: 150 },
      { sceneId: 'two', from: 150, durationInFrames: 150 },
    ])
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

function alignment(): NarrationAlignment {
  return {
    schemaVersion: 1,
    id: 'alignment',
    projectId: 'project',
    narrationId: 'narration',
    scriptVersionId: 'script',
    transcriptId: 'transcript',
    createdAt: '2026-10-02T00:00:00.000Z',
    durationMs: 10000,
    coverage: 1,
    acceptedLowCoverage: false,
    scriptTokens: [],
    deviations: [],
    pauses: [],
    sections: [
      { sectionId: 's1', startMs: 0, endMs: 5000, coverage: 1 },
      { sectionId: 's2', startMs: 5000, endMs: 10000, coverage: 1 },
    ],
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
        id: 'one',
        startMs: 0,
        endMs: 5000,
        sectionIds: ['s1'],
        teachingGoal: 'Introduce topic',
        visualKind: 'title',
        direction: 'Open with the core question.',
        content: { type: 'title', title: 'Why position matters' },
      },
      {
        id: 'two',
        startMs: 5000,
        endMs: 10000,
        sectionIds: ['s2'],
        teachingGoal: 'Explain idea',
        visualKind: 'summary',
        direction: 'Summarize the two takeaways.',
        content: { type: 'summary', title: 'Key idea', bullets: ['Order matters'] },
      },
    ],
  }
}
