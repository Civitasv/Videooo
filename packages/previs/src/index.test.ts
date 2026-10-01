import { describe, expect, it } from 'vitest'
import type {
  NarrationAlignment,
  PrevisStoryboardArtifact,
  ScriptVersion,
  VideoProjectManifest,
} from '@videooo/domain'
import {
  compilePrevisStoryboard,
  estimateScriptTiming,
  estimateTextDurationMs,
  parsePrevisStoryboardArtifact,
  promotePrevisStoryboard,
} from './index.js'

describe('Previs timing', () => {
  it('estimates English and CJK speech with positive durations', () => {
    expect(estimateTextDurationMs('This is a short sentence.')).toBeGreaterThan(
      1500,
    )
    expect(estimateTextDurationMs('这是一个简短的句子。')).toBeGreaterThan(1500)
  })

  it('creates contiguous section timing and scales to project target', () => {
    const timing = estimateScriptTiming(project(), script(), {
      id: 'timing',
      createdAt: '2026-10-02T00:00:00.000Z',
    })

    expect(timing.durationMs).toBe(12000)
    expect(timing.sections[0]).toMatchObject({ startMs: 0 })
    expect(timing.sections[0]!.endMs).toBe(timing.sections[1]!.startMs)
    expect(timing.sections.at(-1)!.endMs).toBe(12000)
  })
})

describe('Previs storyboard', () => {
  it('validates and compiles against estimated timing', () => {
    const timing = estimateScriptTiming(project(), script(), { id: 'timing' })
    const board = storyboard(
      timing.durationMs,
      timing.sections[1]!.startMs,
    )

    expect(parsePrevisStoryboardArtifact(board, project(), timing)).toEqual(board)
    expect(compilePrevisStoryboard(board)).toHaveLength(2)
  })

  it('retimes the same visual plan to real narration', () => {
    const timing = estimateScriptTiming(project(), script(), { id: 'timing' })
    const board = storyboard(
      timing.durationMs,
      timing.sections[1]!.startMs,
    )
    const promoted = promotePrevisStoryboard(board, timing, alignment())

    expect(promoted.alignmentId).toBe('alignment')
    expect(promoted.scenes[0]!.startMs).toBe(0)
    expect(promoted.scenes[0]!.endMs).toBe(8000)
    expect(promoted.scenes[1]!.startMs).toBe(8000)
    expect(promoted.scenes[1]!.endMs).toBe(20000)
    expect(promoted.scenes[0]!.content).toEqual(board.scenes[0]!.content)
  })

  it('fails promotion when real section timing is unavailable', () => {
    const timing = estimateScriptTiming(project(), script(), { id: 'timing' })
    const real = alignment()
    delete real.sections[1]!.startMs

    expect(() =>
      promotePrevisStoryboard(
        storyboard(timing.durationMs, timing.sections[1]!.startMs),
        timing,
        real,
      ),
    ).toThrow('has no start time')
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
    brief: { targetDurationSeconds: 12 },
  }
}

function script(): ScriptVersion {
  return {
    schemaVersion: 1,
    id: 'script',
    projectId: 'project',
    version: 1,
    researchPackId: 'research',
    createdAt: '2026-10-02T00:00:00.000Z',
    sections: [
      {
        id: 's1',
        purpose: 'one',
        narration: 'This is the first section.',
        researchClaimIds: [],
        visualHints: [],
      },
      {
        id: 's2',
        purpose: 'two',
        narration: 'This is the second section with more explanation.',
        researchClaimIds: [],
        visualHints: [],
      },
    ],
  }
}

function storyboard(
  durationMs: number,
  split: number,
): PrevisStoryboardArtifact {
  return {
    schemaVersion: 1,
    id: 'storyboard',
    projectId: 'project',
    timingId: 'timing',
    createdAt: '2026-10-02T00:00:00.000Z',
    video: { width: 1920, height: 1080, fps: 30 },
    scenes: [
      {
        id: 'one',
        startMs: 0,
        endMs: split,
        sectionIds: ['s1'],
        teachingGoal: 'One',
        visualKind: 'title',
        direction: 'Show one',
        content: { type: 'title', title: 'One' },
      },
      {
        id: 'two',
        startMs: split,
        endMs: durationMs,
        sectionIds: ['s2'],
        teachingGoal: 'Two',
        visualKind: 'summary',
        direction: 'Show two',
        content: { type: 'summary', title: 'Two', bullets: ['Two'] },
      },
    ],
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
    durationMs: 20000,
    coverage: 1,
    acceptedLowCoverage: false,
    scriptTokens: [],
    deviations: [],
    pauses: [],
    sections: [
      { sectionId: 's1', startMs: 0, endMs: 7000, coverage: 1 },
      { sectionId: 's2', startMs: 8000, endMs: 20000, coverage: 1 },
    ],
  }
}
