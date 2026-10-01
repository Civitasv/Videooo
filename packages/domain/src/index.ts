export type WorkflowStage =
  | 'topic'
  | 'research'
  | 'draft-script'
  | 'script-review'
  | 'approved'
  | 'recorded'
  | 'aligned'
  | 'storyboarded'
  | 'rendering'
  | 'qa'
  | 'done'

export type RendererKind = 'remotion' | 'manim'

export type VisualKind =
  | 'title'
  | 'typography'
  | 'code'
  | 'diagram'
  | 'equation'
  | 'chart'
  | 'concept-animation'
  | 'media'
  | 'summary'

export interface ProjectBrief {
  audience?: string
  targetDurationSeconds?: number
  angle?: string
  questions?: string[]
  sourceConstraints?: string[]
}

export type SourceType = 'primary' | 'secondary' | 'community' | 'other'

export interface SourceRecord {
  id: string
  title: string
  url: string
  publisher?: string
  publishedAt?: string
  accessedAt: string
  sourceType: SourceType
}

export type ClaimKind = 'fact' | 'interpretation' | 'contested'

export interface ResearchClaim {
  id: string
  text: string
  sourceIds: string[]
  confidence: 'high' | 'medium' | 'low'
  kind: ClaimKind
  notes?: string
}

export interface ResearchDefinition {
  id: string
  term: string
  definition: string
  sourceIds: string[]
}

export interface ResearchExample {
  id: string
  description: string
  relatedClaimIds: string[]
}

export interface ResearchMisconception {
  id: string
  misconception: string
  correction: string
  relatedClaimIds: string[]
}

export type VisualOpportunityKind =
  | 'diagram'
  | 'equation'
  | 'chart'
  | 'concept-animation'
  | 'code'
  | 'comparison'

export interface VisualOpportunity {
  id: string
  description: string
  relatedClaimIds: string[]
  suggestedKind?: VisualOpportunityKind
}

export interface ResearchPack {
  schemaVersion: 1
  id: string
  projectId: string
  topic: string
  createdAt: string
  questions: string[]
  sources: SourceRecord[]
  claims: ResearchClaim[]
  definitions: ResearchDefinition[]
  examples: ResearchExample[]
  misconceptions: ResearchMisconception[]
  visualOpportunities: VisualOpportunity[]
  unresolved: string[]
}

export interface ScriptSection {
  id: string
  purpose: string
  narration: string
  researchClaimIds: string[]
  visualHints: string[]
}

export interface ScriptVersion {
  schemaVersion: 1
  id: string
  projectId: string
  version: number
  parentVersionId?: string
  researchPackId: string
  createdAt: string
  changeSummary?: string
  sections: ScriptSection[]
}

export interface NarrationAsset {
  schemaVersion: 1
  id: string
  projectId: string
  scriptVersionId: string
  importedAt: string
  sourceFileName: string
  storedFileName: string
  sha256: string
  byteLength: number
  mediaType?: string
}

export interface TranscriptSegment {
  id: string
  startMs: number
  endMs: number
  text: string
}

export interface TranscriptToken {
  id: string
  startMs: number
  endMs: number
  text: string
  confidence?: number
}

export interface TranscriptArtifact {
  schemaVersion: 1
  id: string
  projectId: string
  narrationId: string
  createdAt: string
  provider: string
  model?: string
  language?: string
  durationMs: number
  text: string
  segments: TranscriptSegment[]
  tokens: TranscriptToken[]
}

export interface ScriptToken {
  id: string
  sectionId: string
  index: number
  text: string
  normalized: string
}

export type AlignmentStatus =
  | 'exact'
  | 'normalized'
  | 'substituted'
  | 'missing'
  | 'interpolated'

export interface AlignedScriptToken extends ScriptToken {
  startMs?: number
  endMs?: number
  transcriptTokenIds: string[]
  status: AlignmentStatus
}

export interface ScriptDeviation {
  id: string
  kind: 'insertion' | 'deletion' | 'substitution'
  sectionId?: string
  scriptText?: string
  spokenText?: string
  startMs?: number
  endMs?: number
}

export interface NarrationPause {
  startMs: number
  endMs: number
  durationMs: number
}

export interface AlignedSection {
  sectionId: string
  startMs?: number
  endMs?: number
  coverage: number
}

export interface NarrationAlignment {
  schemaVersion: 1
  id: string
  projectId: string
  narrationId: string
  scriptVersionId: string
  transcriptId: string
  createdAt: string
  durationMs: number
  coverage: number
  acceptedLowCoverage: boolean
  scriptTokens: AlignedScriptToken[]
  deviations: ScriptDeviation[]
  pauses: NarrationPause[]
  sections: AlignedSection[]
}

export interface NarrationSegment {
  id: string
  startMs: number
  endMs: number
  text: string
}

export interface WordTiming {
  word: string
  startMs: number
  endMs: number
}

export interface SceneObject {
  id: string
  kind: string
  text?: string
  assetId?: string
}

export interface SceneAction {
  atMs: number
  type: string
  target?: string
  value?: string | number | boolean
}

export interface SceneIR {
  id: string
  startMs: number
  durationMs: number
  narrationSegmentIds: string[]
  teachingGoal: string
  renderer: RendererKind
  visualKind: VisualKind
  objects: SceneObject[]
  actions: SceneAction[]
}

export interface RenderArtifact {
  sceneId: string
  renderer: RendererKind
  path: string
  durationMs: number
}

export interface QaFinding {
  id: string
  sceneId: string
  severity: 'info' | 'warning' | 'error'
  category: 'structural' | 'visual' | 'semantic' | 'continuity'
  message: string
}

export interface VideoProjectManifest {
  schemaVersion: 1
  id: string
  topic: string
  stage: WorkflowStage
  createdAt: string
  updatedAt: string
  brief?: ProjectBrief
  researchPackId?: string
  approvedScriptVersionId?: string
  approvedScriptAt?: string
  narrationId?: string
  transcriptId?: string
  alignmentId?: string
}

export interface RendererAdapter {
  readonly kind: RendererKind
  supports(scene: SceneIR): boolean
}
