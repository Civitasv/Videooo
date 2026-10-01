import { describe, expect, it } from 'vitest'
import type {
  NarrationAlignment,
  NarrationAsset,
  TranscriptArtifact,
  VideoProjectManifest,
} from '@videooo/domain'
import {
  acceptAlignment,
  acceptNarration,
  acceptTranscript,
  parseTranscriptArtifact,
} from './narration.js'

describe('M2 workflow', () => {
  const narration: NarrationAsset = {
    schemaVersion: 1,
    id: 'narration-1',
    projectId: 'project',
    scriptVersionId: 'script-1',
    importedAt: '2026-10-02T00:00:00.000Z',
    sourceFileName: 'voice.wav',
    storedFileName: 'source.wav',
    sha256: 'a'.repeat(64),
    byteLength: 10,
  }

  it('binds narration to the approved script', () => {
    const project = makeProject('approved')
    const recorded = acceptNarration(project, narration)

    expect(recorded.stage).toBe('recorded')
    expect(recorded.narrationId).toBe('narration-1')
  })

  it('rejects narration before approval', () => {
    expect(() =>
      acceptNarration(makeProject('script-review'), narration),
    ).toThrow('requires stage "approved"')
  })

  it('validates transcript timing and identity', () => {
    const project = { ...makeProject('recorded'), narrationId: narration.id }
    const value = transcript()
    expect(parseTranscriptArtifact(value, project, narration)).toEqual(value)

    const invalid = transcript()
    invalid.tokens[0]!.startMs = -1
    expect(() =>
      parseTranscriptArtifact(invalid, project, narration),
    ).toThrow('timestamps must be non-negative')
  })

  it('keeps transcript import in recorded stage', () => {
    const project = { ...makeProject('recorded'), narrationId: narration.id }
    const next = acceptTranscript(project, transcript())

    expect(next.stage).toBe('recorded')
    expect(next.transcriptId).toBe('transcript-1')
  })

  it('enforces alignment coverage', () => {
    const project = {
      ...makeProject('recorded'),
      narrationId: narration.id,
      transcriptId: 'transcript-1',
    }

    expect(() => acceptAlignment(project, alignment(0.7, false))).toThrow(
      'below the required',
    )

    const accepted = acceptAlignment(project, alignment(0.7, true))
    expect(accepted.stage).toBe('aligned')
    expect(accepted.alignmentId).toBe('alignment-1')
  })
})

function makeProject(
  stage: VideoProjectManifest['stage'],
): VideoProjectManifest {
  return {
    schemaVersion: 1,
    id: 'project',
    topic: 'Topic',
    stage,
    createdAt: '2026-10-02T00:00:00.000Z',
    updatedAt: '2026-10-02T00:00:00.000Z',
    approvedScriptVersionId: 'script-1',
  }
}

function transcript(): TranscriptArtifact {
  return {
    schemaVersion: 1,
    id: 'transcript-1',
    projectId: 'project',
    narrationId: 'narration-1',
    createdAt: '2026-10-02T00:00:00.000Z',
    provider: 'test',
    durationMs: 1000,
    text: 'hello',
    segments: [
      {
        id: 'segment-1',
        startMs: 0,
        endMs: 1000,
        text: 'hello',
      },
    ],
    tokens: [
      {
        id: 'token-1',
        startMs: 0,
        endMs: 500,
        text: 'hello',
      },
    ],
  }
}

function alignment(
  coverage: number,
  acceptedLowCoverage: boolean,
): NarrationAlignment {
  return {
    schemaVersion: 1,
    id: 'alignment-1',
    projectId: 'project',
    narrationId: 'narration-1',
    scriptVersionId: 'script-1',
    transcriptId: 'transcript-1',
    createdAt: '2026-10-02T00:00:00.000Z',
    durationMs: 1000,
    coverage,
    acceptedLowCoverage,
    scriptTokens: [],
    deviations: [],
    pauses: [],
    sections: [],
  }
}
