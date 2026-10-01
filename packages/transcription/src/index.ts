import type { TranscriptArtifact } from '@videooo/domain'

export interface TranscriptionRequest {
  audioPath: string
  projectId: string
  narrationId: string
  language?: string
}

export interface Transcriber {
  readonly id: string
  transcribe(request: TranscriptionRequest): Promise<TranscriptArtifact>
}
