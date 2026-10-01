import { describe, expect, it } from 'vitest'
import type {
  QaRepairOverlay,
  QaReport,
  SceneIR,
  VideoProjectManifest,
} from '@videooo/domain'
import {
  applyQaRepairOverlays,
  parseQaRepairOverlay,
} from './index.js'

describe('QA repair overlays', () => {
  it('applies a visual repair without mutating base timing or teaching goal', () => {
    const base = [scene()]
    const overlay: QaRepairOverlay = {
      schemaVersion: 1,
      id: 'repair-001',
      projectId: 'project',
      qaReportId: 'report',
      createdAt: '2026-10-02T00:00:00.000Z',
      sceneRepairs: [
        {
          sceneId: 'scene',
          findingIds: ['visual-1'],
          visualKind: 'summary',
          content: {
            type: 'summary',
            title: 'Takeaway',
            bullets: ['Keep it concise'],
          },
          transition: 'cut',
        },
      ],
    }

    const parsed = parseQaRepairOverlay(
      overlay,
      project(),
      report(),
      base,
    )
    const effective = applyQaRepairOverlays(base, [parsed])

    expect(effective[0]).toMatchObject({
      renderer: 'remotion',
      visualKind: 'summary',
      startMs: 1000,
      durationMs: 4000,
      teachingGoal: 'Explain the same concept',
      transition: 'cut',
    })
    expect(effective[0]!.content).toEqual({
      type: 'summary',
      title: 'Takeaway',
      bullets: ['Keep it concise'],
    })
    expect(base[0]!.visualKind).toBe('typography')
  })

  it('re-routes a repaired scene to Manim deterministically', () => {
    const overlay = parseQaRepairOverlay(
      {
        schemaVersion: 1,
        id: 'repair-001',
        projectId: 'project',
        qaReportId: 'report',
        createdAt: '2026-10-02T00:00:00.000Z',
        sceneRepairs: [
          {
            sceneId: 'scene',
            findingIds: ['visual-1'],
            visualKind: 'vector',
            content: {
              type: 'vector',
              vectors: [
                { id: 'v', from: [0, 0], to: [1, 1] },
              ],
            },
          },
        ],
      },
      project(),
      report(),
      [scene()],
    )

    expect(applyQaRepairOverlays([scene()], [overlay])[0]!.renderer).toBe(
      'manim',
    )
  })

  it('rejects repairs not tied to a blocking finding', () => {
    expect(() =>
      parseQaRepairOverlay(
        {
          schemaVersion: 1,
          id: 'repair-001',
          projectId: 'project',
          qaReportId: 'report',
          createdAt: '2026-10-02T00:00:00.000Z',
          sceneRepairs: [
            {
              sceneId: 'scene',
              findingIds: ['warning-1'],
              content: {
                type: 'typography',
                headline: 'Fixed',
              },
            },
          ],
        },
        project(),
        report(),
        [scene()],
      ),
    ).toThrow('non-blocking finding')
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
    qaReportId: 'report',
  }
}

function report(): QaReport {
  return {
    schemaVersion: 1,
    id: 'report',
    projectId: 'project',
    evidenceId: 'run-001',
    renderId: 'render',
    createdAt: '2026-10-02T00:00:00.000Z',
    findings: [
      {
        id: 'visual-1',
        sceneId: 'scene',
        severity: 'error',
        category: 'visual',
        message: 'Too dense',
      },
      {
        id: 'warning-1',
        sceneId: 'scene',
        severity: 'warning',
        category: 'visual',
        message: 'Could improve',
      },
    ],
    blockingFindingIds: ['visual-1'],
    status: 'fail',
  }
}

function scene(): SceneIR {
  return {
    schemaVersion: 1,
    id: 'scene',
    projectId: 'project',
    storyboardId: 'storyboard',
    startMs: 1000,
    durationMs: 4000,
    sectionIds: ['s1'],
    teachingGoal: 'Explain the same concept',
    renderer: 'remotion',
    visualKind: 'typography',
    content: {
      type: 'typography',
      headline: 'Original',
    },
    transition: 'fade',
  }
}
