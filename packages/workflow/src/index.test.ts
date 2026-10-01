import { describe, expect, it } from 'vitest'
import type {
  ResearchPack,
  ScriptVersion,
  VideoProjectManifest,
} from '@videooo/domain'
import {
  acceptScriptVersion,
  approveScriptVersion,
  canTransition,
  createProject,
  parseResearchPack,
  parseScriptVersion,
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
  const project = makeProject('research')

  it('accepts a valid research pack', () => {
    const pack = makeResearch()
    expect(parseResearchPack(pack, project)).toEqual(pack)
  })

  it('rejects unknown source references', () => {
    const pack = makeResearch()
    pack.claims[0]!.sourceIds = ['missing']
    expect(() => parseResearchPack(pack, project)).toThrow('unknown id "missing"')
  })

  it('rejects fact claims without provenance', () => {
    const pack = makeResearch()
    pack.claims[0]!.sourceIds = []
    expect(() => parseResearchPack(pack, project)).toThrow(
      'requires at least one source',
    )
  })

  it('rejects project mismatch', () => {
    const pack = makeResearch()
    pack.projectId = 'other'
    expect(() => parseResearchPack(pack, project)).toThrow(
      'projectId must be "attention"',
    )
  })

  it('rejects duplicate source ids', () => {
    const pack = makeResearch()
    pack.sources.push({ ...pack.sources[0]! })
    expect(() => parseResearchPack(pack, project)).toThrow(
      'duplicate source id "src-1"',
    )
  })
})

describe('Script Version validation and approval', () => {
  const research = makeResearch()

  it('accepts a valid first script version', () => {
    const project = makeProject('draft-script')
    const script = makeScript(1)

    expect(parseScriptVersion(script, project, research, null)).toEqual(script)
  })

  it('rejects unknown research claim references', () => {
    const project = makeProject('draft-script')
    const script = makeScript(1)
    script.sections[0]!.researchClaimIds = ['missing']

    expect(() => parseScriptVersion(script, project, research, null)).toThrow(
      'unknown id "missing"',
    )
  })

  it('requires sequential revision versions and parent ids', () => {
    const project = makeProject('script-review')
    const previous = makeScript(1)
    const revision = makeScript(3)
    revision.parentVersionId = 'wrong'

    expect(() =>
      parseScriptVersion(revision, project, research, previous),
    ).toThrow('version must be 2')
    expect(() =>
      parseScriptVersion(revision, project, research, previous),
    ).toThrow('parentVersionId must be "script-001"')
  })

  it('moves the first accepted script into review', () => {
    const project = makeProject('draft-script')
    expect(
      acceptScriptVersion(project, '2026-10-01T00:03:00.000Z').stage,
    ).toBe('script-review')
  })

  it('keeps revisions in review', () => {
    const project = makeProject('script-review')
    const next = acceptScriptVersion(project, '2026-10-01T00:03:00.000Z')
    expect(next.stage).toBe('script-review')
    expect(next.updatedAt).toBe('2026-10-01T00:03:00.000Z')
  })

  it('approves without mutating the script version', () => {
    const project = makeProject('script-review')
    const script = makeScript(1)
    const snapshot = structuredClone(script)

    const approved = approveScriptVersion(
      project,
      script,
      '2026-10-01T00:04:00.000Z',
    )

    expect(script).toEqual(snapshot)
    expect(approved.stage).toBe('approved')
    expect(approved.approvedScriptVersionId).toBe('script-001')
    expect(approved.approvedScriptAt).toBe('2026-10-01T00:04:00.000Z')
  })

  it('cannot approve outside script review', () => {
    const project = makeProject('draft-script')
    expect(() => approveScriptVersion(project, makeScript(1))).toThrow(
      'requires stage "script-review"',
    )
  })
})

function makeProject(stage: VideoProjectManifest['stage']): VideoProjectManifest {
  return {
    schemaVersion: 1,
    id: 'attention',
    topic: 'Why attention needs position',
    stage,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    researchPackId: 'research-001',
  }
}

function makeResearch(): ResearchPack {
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
    visualOpportunities: [],
    unresolved: [],
  }
}

function makeScript(version: number): ScriptVersion {
  return {
    schemaVersion: 1,
    id: `script-${String(version).padStart(3, '0')}`,
    projectId: 'attention',
    version,
    ...(version === 1
      ? {}
      : { parentVersionId: `script-${String(version - 1).padStart(3, '0')}` }),
    researchPackId: 'research-001',
    createdAt: '2026-10-01T00:02:00.000Z',
    ...(version === 1 ? {} : { changeSummary: 'Revise explanation order.' }),
    sections: [
      {
        id: 'hook',
        purpose: 'Introduce the missing order signal.',
        narration: 'Self-attention sees relationships, but order needs another signal.',
        researchClaimIds: ['claim-1'],
        visualHints: ['Show a token row, then swap two tokens.'],
      },
    ],
  }
}
