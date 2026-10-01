import { describe, expect, it } from 'vitest'
import type {
  NarrationAlignment,
  StoryboardArtifact,
  VideoProjectManifest,
} from '@videooo/domain'
import {
  compileStoryboard,
  parseStoryboardArtifact,
} from './index.js'

describe('M4 storyboard routing', () => {
  it('routes equation scenes to Manim', () => {
    const board = storyboard({
      visualKind: 'equation',
      content: {
        type: 'equation',
        steps: ['x+1=2', 'x=1'],
      },
    })
    expect(parseStoryboardArtifact(board, project(), alignment())).toEqual(board)
    expect(compileStoryboard(board)[0]!.renderer).toBe('manim')
  })

  it('rejects invalid algorithm active indices', () => {
    const board = storyboard({
      visualKind: 'algorithm',
      content: {
        type: 'algorithm',
        states: [
          { label: 'step', values: ['a'], activeIndices: [2] },
        ],
      },
    })

    expect(() =>
      parseStoryboardArtifact(board, project(), alignment()),
    ).toThrow('invalid active index')
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
    durationMs: 3000,
    coverage: 1,
    acceptedLowCoverage: false,
    scriptTokens: [],
    deviations: [],
    pauses: [],
    sections: [
      { sectionId: 's1', startMs: 0, endMs: 3000, coverage: 1 },
    ],
  }
}

function storyboard(scene: {
  visualKind: StoryboardArtifact['scenes'][number]['visualKind']
  content: StoryboardArtifact['scenes'][number]['content']
}): StoryboardArtifact {
  return {
    schemaVersion: 1,
    id: 'storyboard',
    projectId: 'project',
    alignmentId: 'alignment',
    createdAt: '2026-10-02T00:00:00.000Z',
    video: { width: 1920, height: 1080, fps: 30 },
    scenes: [
      {
        id: 'scene',
        startMs: 0,
        endMs: 3000,
        sectionIds: ['s1'],
        teachingGoal: 'Explain',
        direction: 'Animate the relationship.',
        visualKind: scene.visualKind,
        content: scene.content,
      },
    ],
  }
}
