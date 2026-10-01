import { describe, expect, it } from 'vitest'
import type { ResearchPack, VideoProjectManifest } from '@videooo/domain'
import {
  canTransition,
  createProject,
  parseResearchPack,
  transitionProject,
} from './index.js'

describe('Videooo workflow', () => {
  it('requires explicit progression through script review', () => {
    expect(canTransition('draft-script', 'script-review')).toBe(true)
    expect(canTransition('draft-script', 'approved')).toBe(false)
    expect(canTransition('script-review', 'approved')).toBe(true)
  })

  it('allows QA to request a render repair loop', () => {
    expect(canTransition('qa', 'rendering')).toBe(true)
    expect(canTransition('qa', 'done')).toBe(true)
  })

  it('creates deterministic project data with deterministic inputs', () => {
    const project = createProject('Why attention needs position', {
      id: 'attention-position',
      now: '2026-10-01T00:00:00.000Z',
    })

    expect(project).toEqual({
      schemaVersion: 1,
      id: 'attention-position',
      topic: 'Why attention needs position',
      stage: 'topic',
      createdAt: '2026-10-01T00:00:00.000Z',
      updatedAt: '2026-10-01T00:00:00.000Z',
    })
  })

  it('rejects invalid jumps', () => {
    const project = createProject('Test', {
      id: 'test',
      now: '2026-10-01T00:00:00.000Z',
    })

    expect(() => transitionProject(project, 'rendering')).toThrow(
      'Invalid Videooo workflow transition: topic -> rendering',
    )
  })
})

describe('Research Pack validation', () => {
  const project: VideoProjectManifest = {
    schemaVersion: 1,
    id: 'attention',
    topic: 'Why attention needs position',
    stage: 'research',
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
  }

  function validPack(): ResearchPack {
    return {
      schemaVersion: 1,
      id: 'research-001',
      projectId: 'attention',
      topic: 'Why attention needs position',
      createdAt: '2026-10-01T00:01:00.000Z',
      questions: ['What information is absent from self-attention?'],
      sources: [
        {
          id: 'src-1',
          title: 'Attention Is All You Need',
          url: 'https://arxiv.org/abs/1706.03762',
          accessedAt: '2026-10-01T00:00:30.000Z',
          sourceType: 'primary',
        },
      ],
      claims: [
        {
          id: 'claim-1',
          text: 'The Transformer adds positional information to token representations.',
          sourceIds: ['src-1'],
          confidence: 'high',
          kind: 'fact',
        },
      ],
      definitions: [],
      examples: [],
      misconceptions: [],
      visualOpportunities: [
        {
          id: 'visual-1',
          description: 'Swap two tokens and highlight the missing order signal.',
          relatedClaimIds: ['claim-1'],
          suggestedKind: 'concept-animation',
        },
      ],
      unresolved: [],
    }
  }

  it('accepts a valid research pack', () => {
    const pack = validPack()
    expect(parseResearchPack(pack, project)).toEqual(pack)
  })

  it('rejects unknown source references', () => {
    const pack = validPack()
    pack.claims[0]!.sourceIds = ['missing']
    expect(() => parseResearchPack(pack, project)).toThrow('unknown id "missing"')
  })

  it('rejects fact claims without provenance', () => {
    const pack = validPack()
    pack.claims[0]!.sourceIds = []
    expect(() => parseResearchPack(pack, project)).toThrow(
      'requires at least one source',
    )
  })

  it('rejects project mismatch', () => {
    const pack = validPack()
    pack.projectId = 'other'
    expect(() => parseResearchPack(pack, project)).toThrow(
      'projectId must be "attention"',
    )
  })

  it('rejects duplicate source ids', () => {
    const pack = validPack()
    pack.sources.push({ ...pack.sources[0]! })
    expect(() => parseResearchPack(pack, project)).toThrow(
      'duplicate source id "src-1"',
    )
  })
})
