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

export type M3VisualKind =
  | 'title'
  | 'typography'
  | 'code'
  | 'diagram'
  | 'summary'

export type SceneTransition = 'cut' | 'fade' | 'slide'

export interface TitleSceneContent {
  type: 'title'
  eyebrow?: string
  title: string
  subtitle?: string
}

export interface TypographySceneContent {
  type: 'typography'
  headline: string
  body?: string
  emphasis?: string[]
}

export interface CodeSceneContent {
  type: 'code'
  title?: string
  language?: string
  code: string
  highlightedLines?: number[]
  annotation?: string
}

export interface DiagramNode {
  id: string
  label: string
  x: number
  y: number
  emphasis?: boolean
}

export interface DiagramEdge {
  from: string
  to: string
  label?: string
}

export interface DiagramSceneContent {
  type: 'diagram'
  title?: string
  nodes: DiagramNode[]
  edges: DiagramEdge[]
}

export interface SummarySceneContent {
  type: 'summary'
  title: string
  bullets: string[]
}

export type SceneContent =
  | TitleSceneContent
  | TypographySceneContent
  | CodeSceneContent
  | DiagramSceneContent
  | SummarySceneContent

export interface VideoFormat {
  width: number
  height: number
  fps: number
}

export interface StoryboardScene {
  id: string
  startMs: number
  endMs: number
  sectionIds: string[]
  teachingGoal: string
  visualKind: M3VisualKind
  direction: string
  content: SceneContent
  transition?: SceneTransition
}

export interface StoryboardArtifact {
  schemaVersion: 1
  id: string
  projectId: string
  alignmentId: string
  createdAt: string
  video: VideoFormat
  scenes: StoryboardScene[]
}

export interface VideoStyle {
  schemaVersion: 1
  id: string
  background: string
  surface: string
  foreground: string
  muted: string
  accent: string
  accentSoft: string
  fontFamily: string
  monoFontFamily: string
  safeAreaPx: number
  radiusPx: number
}

export interface SceneFramePlan {
  sceneId: string
  from: number
  durationInFrames: number
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
  schemaVersion: 1
  id: string
  projectId: string
  storyboardId: string
  startMs: number
  durationMs: number
  sectionIds: string[]
  teachingGoal: string
  renderer: 'remotion'
  visualKind: M3VisualKind
  content: SceneContent
  transition: SceneTransition
}

export interface VideoRenderManifest {
  schemaVersion: 1
  id: string
  projectId: string
  storyboardId: string
  alignmentId: string
  createdAt: string
  renderer: 'remotion'
  outputPath: string
  width: number
  height: number
  fps: number
  durationMs: number
  codec: 'h264'
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
  storyboardId?: string
  styleId?: string
  sceneCount?: number
  renderId?: string
}

export interface RendererAdapter {
  readonly kind: RendererKind
  supports(scene: SceneIR): boolean
}
