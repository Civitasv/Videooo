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

export interface SourceRecord {
  id: string
  title: string
  url: string
  accessedAt: string
}

export interface ResearchClaim {
  id: string
  text: string
  sourceIds: string[]
  confidence: 'high' | 'medium' | 'low'
}

export interface ResearchPack {
  topic: string
  questions: string[]
  claims: ResearchClaim[]
  sources: SourceRecord[]
  examples: string[]
  misconceptions: string[]
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
  id: string
  version: number
  status: 'draft' | 'approved'
  createdAt: string
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
  approvedScriptVersionId?: string
}

export interface RendererAdapter {
  readonly kind: RendererKind
  supports(scene: SceneIR): boolean
}
