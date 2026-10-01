import { describe, expect, it } from 'vitest'
import type { ScriptVersion, TranscriptArtifact } from '@videooo/domain'
import { buildNarrationAlignment, normalizeToken } from './index.js'

describe('alignment', () => {
  it('aligns an exact script and transcript', () => {
    const result = buildNarrationAlignment(
      script('Hello world'),
      transcript([
        ['Hello', 0, 400],
        ['world', 500, 900],
      ]),
      { id: 'alignment-1', createdAt: '2026-10-02T00:00:00.000Z' },
    )

    expect(result.coverage).toBe(1)
    expect(result.deviations).toHaveLength(0)
    expect(result.scriptTokens.map((token) => token.status)).toEqual([
      'exact',
      'exact',
    ])
    expect(result.sections[0]).toMatchObject({
      startMs: 0,
      endMs: 900,
      coverage: 1,
    })
  })

  it('normalizes case and punctuation for comparison', () => {
    expect(normalizeToken('Hello,')).toBe('hello')
    const result = buildNarrationAlignment(
      script('Hello, WORLD!'),
      transcript([
        ['hello', 0, 300],
        ['world', 350, 700],
      ]),
    )

    expect(result.coverage).toBe(1)
    expect(result.deviations).toHaveLength(0)
    expect(result.scriptTokens.every((token) => token.status === 'normalized')).toBe(
      true,
    )
  })

  it('reports substitutions and insertions', () => {
    const result = buildNarrationAlignment(
      script('the model learns'),
      transcript([
        ['the', 0, 200],
        ['small', 220, 400],
        ['model', 420, 700],
        ['changes', 720, 1000],
      ]),
    )

    expect(result.deviations.some((item) => item.kind === 'insertion')).toBe(true)
    expect(
      result.deviations.some((item) => item.kind === 'substitution'),
    ).toBe(true)
  })

  it('interpolates a short deleted run between anchors', () => {
    const result = buildNarrationAlignment(
      script('one two three four'),
      transcript([
        ['one', 0, 200],
        ['four', 800, 1000],
      ]),
    )

    expect(result.scriptTokens[1]!.status).toBe('interpolated')
    expect(result.scriptTokens[2]!.status).toBe('interpolated')
    expect(result.coverage).toBe(1)
  })

  it('detects pauses', () => {
    const result = buildNarrationAlignment(
      script('one two'),
      transcript([
        ['one', 0, 200],
        ['two', 800, 1000],
      ]),
      { pauseThresholdMs: 350 },
    )

    expect(result.pauses).toEqual([
      { startMs: 200, endMs: 800, durationMs: 600 },
    ])
  })

  it('segments CJK text deterministically', () => {
    const result = buildNarrationAlignment(
      script('我们解释注意力机制'),
      transcript([['我们解释注意力机制', 0, 1400]]),
    )

    expect(result.scriptTokens.length).toBeGreaterThan(0)
    expect(result.coverage).toBe(1)
  })
})

function script(narration: string): ScriptVersion {
  return {
    schemaVersion: 1,
    id: 'script-001',
    projectId: 'project',
    version: 1,
    researchPackId: 'research',
    createdAt: '2026-10-02T00:00:00.000Z',
    sections: [
      {
        id: 'section',
        purpose: 'test',
        narration,
        researchClaimIds: [],
        visualHints: [],
      },
    ],
  }
}

function transcript(
  words: Array<[string, number, number]>,
): TranscriptArtifact {
  return {
    schemaVersion: 1,
    id: 'transcript-001',
    projectId: 'project',
    narrationId: 'narration-001',
    createdAt: '2026-10-02T00:00:00.000Z',
    provider: 'test',
    durationMs: Math.max(...words.map((word) => word[2]), 1),
    text: words.map((word) => word[0]).join(' '),
    segments: [],
    tokens: words.map(([text, startMs, endMs], index) => ({
      id: `token-${index + 1}`,
      text,
      startMs,
      endMs,
    })),
  }
}
