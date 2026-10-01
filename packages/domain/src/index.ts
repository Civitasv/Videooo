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
}

export interface RendererAdapter {
  readonly kind: RendererKind
  supports(scene: SceneIR): boolean
}
