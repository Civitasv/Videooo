import { describe, expect, it } from 'vitest'
import {
  buildFfmpegArgs,
  buildWhisperCppArgs,
  parseWhisperCppJson,
} from './index.js'

describe('whisper.cpp adapter', () => {
  it('normalizes audio to 16 kHz mono PCM WAV', () => {
    const args = buildFfmpegArgs('/tmp/input.m4a', '/tmp/normalized.wav')
    expect(args).toContain('16000')
    expect(args).toContain('1')
    expect(args).toContain('pcm_s16le')
  })

  it('requests full JSON without enabling VAD', () => {
    const args = buildWhisperCppArgs({
      modelPath: '/tmp/model.bin',
      audioPath: '/tmp/normalized.wav',
      outputBase: '/tmp/output',
      language: 'zh',
    })

    expect(args).toContain('-ojf')
    expect(args).toContain('-np')
    expect(args).not.toContain('--vad')
    expect(args).not.toContain('-vad')
  })

  it('parses full JSON into canonical transcript data', () => {
    const transcript = parseWhisperCppJson(
      {
        result: { language: 'en' },
        transcription: [
          {
            offsets: { from: 0, to: 1000 },
            text: ' Hello world.',
            tokens: [
              {
                text: ' Hello',
                offsets: { from: 50, to: 400 },
                p: 0.9,
              },
              {
                text: ' world',
                offsets: { from: 420, to: 850 },
                p: 0.8,
              },
              {
                text: '.',
                offsets: { from: 850, to: 900 },
                p: 0.7,
              },
              {
                text: '<|endoftext|>',
                offsets: { from: 900, to: 1000 },
                p: 1,
              },
            ],
          },
        ],
      },
      {
        projectId: 'project',
        narrationId: 'narration',
        model: 'model.bin',
        createdAt: '2026-10-02T00:00:00.000Z',
      },
    )

    expect(transcript).toMatchObject({
      projectId: 'project',
      narrationId: 'narration',
      provider: 'whisper-cpp',
      model: 'model.bin',
      language: 'en',
      durationMs: 1000,
    })
    expect(transcript.tokens).toHaveLength(3)
    expect(transcript.tokens[0]).toMatchObject({
      text: ' Hello',
      startMs: 50,
      endMs: 400,
      confidence: 0.9,
    })
  })

  it('rejects malformed offsets instead of inventing timing', () => {
    expect(() =>
      parseWhisperCppJson(
        {
          transcription: [
            {
              offsets: { from: 100, to: 50 },
              text: 'bad',
              tokens: [],
            },
          ],
        },
        { projectId: 'project', narrationId: 'narration' },
      ),
    ).toThrow('Invalid whisper.cpp JSON offsets')
  })
})
