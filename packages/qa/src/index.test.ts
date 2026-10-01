import { describe, expect, it } from 'vitest'
import type {
  QaEvidencePack,
  QaReviewArtifact,
  SceneIR,
} from '@videooo/domain'
import {
  assertQaReportPasses,
  buildQaReport,
  parseQaReviewArtifact,
  planQaFrameSamples,
} from './index.js'

describe('QA evidence planning', () => {
  it('samples each normal scene at 10, 50, and 90 percent', () => {
    const plans = planQaFrameSamples([scene('a', 0, 10000)], 30)

    expect(plans.map((plan) => plan.timeMs)).toEqual([1000, 5000, 9000])
    expect(plans.map((plan) => plan.frame)).toEqual([30, 150, 270])
  })

  it('deduplicates evidence samples that land on the same frame', () => {
    const plans = planQaFrameSamples([scene('tiny', 0, 20)], 30)
    expect(plans.length).toBeLessThan(3)
    expect(new Set(plans.map((plan) => plan.frame)).size).toBe(plans.length)
  })
})

describe('QA review and report', () => {
  it('preserves runtime structural findings when merging review', () => {
    const evidence = makeEvidence()
    const review = parseQaReviewArtifact(
      {
        schemaVersion: 1,
        id: 'review-1',
        projectId: 'project',
        evidenceId: 'run-001',
        createdAt: '2026-10-02T00:00:00.000Z',
        findings: [],
      },
      evidence,
    )

    const report = buildQaReport(evidence, review, {
      id: 'report-1',
      createdAt: '2026-10-02T00:00:00.000Z',
    })

    expect(report.status).toBe('fail')
    expect(report.blockingFindingIds).toEqual(['struct-0001'])
    expect(() => assertQaReportPasses(report)).toThrow('blocking finding')
  })

  it('accepts a clean agent review and creates a passing report', () => {
    const evidence = makeEvidence()
    evidence.structuralFindings = []
    const review: QaReviewArtifact = {
      schemaVersion: 1,
      id: 'review-1',
      projectId: 'project',
      evidenceId: 'run-001',
      createdAt: '2026-10-02T00:00:00.000Z',
      findings: [
        {
          id: 'visual-1',
          sceneId: 'a',
          severity: 'warning',
          category: 'visual',
          message: 'Could use slightly more breathing room.',
          evidenceFrameIds: ['a:0500'],
        },
      ],
    }

    const parsed = parseQaReviewArtifact(review, evidence)
    const report = buildQaReport(evidence, parsed)

    expect(report.status).toBe('pass')
    expect(() => assertQaReportPasses(report)).not.toThrow()
  })

  it('rejects agent attempts to submit structural findings', () => {
    const evidence = makeEvidence()
    expect(() =>
      parseQaReviewArtifact(
        {
          schemaVersion: 1,
          id: 'review-1',
          projectId: 'project',
          evidenceId: 'run-001',
          createdAt: '2026-10-02T00:00:00.000Z',
          findings: [
            {
              id: 'x',
              sceneId: 'a',
              severity: 'error',
              category: 'structural',
              message: 'try to override runtime',
            },
          ],
        },
        evidence,
      ),
    ).toThrow('category must be visual, semantic, or continuity')
  })
})

function scene(
  id: string,
  startMs: number,
  durationMs: number,
): SceneIR {
  return {
    schemaVersion: 1,
    id,
    projectId: 'project',
    storyboardId: 'storyboard',
    startMs,
    durationMs,
    sectionIds: ['s1'],
    teachingGoal: 'Explain',
    renderer: 'remotion',
    visualKind: 'title',
    content: { type: 'title', title: 'A' },
    transition: 'fade',
  }
}

function makeEvidence(): QaEvidencePack {
  return {
    schemaVersion: 1,
    id: 'run-001',
    projectId: 'project',
    renderId: 'render',
    storyboardId: 'storyboard',
    alignmentId: 'alignment',
    createdAt: '2026-10-02T00:00:00.000Z',
    videoPath: 'renders/draft.mp4',
    durationMs: 10000,
    scenes: [
      {
        sceneId: 'a',
        renderer: 'remotion',
        visualKind: 'title',
        teachingGoal: 'Explain',
        startMs: 0,
        endMs: 10000,
        narrationText: 'Narration',
        frameSamples: [
          {
            id: 'a:0500',
            sceneId: 'a',
            timeMs: 5000,
            localProgress: 0.5,
            fileName: 'a__0500.png',
          },
        ],
      },
    ],
    structuralFindings: [
      {
        id: 'struct-0001',
        sceneId: '__video__',
        severity: 'error',
        category: 'structural',
        message: 'Duration mismatch',
      },
    ],
  }
}
