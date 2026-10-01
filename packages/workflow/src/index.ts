import type {
  ProjectBrief,
  ResearchPack,
  ScriptVersion,
  VideoProjectManifest,
  WorkflowStage,
} from '@videooo/domain'

const transitions: Readonly<Record<WorkflowStage, readonly WorkflowStage[]>> = {
  topic: ['research'],
  research: ['draft-script'],
  'draft-script': ['script-review'],
  'script-review': ['draft-script', 'approved'],
  approved: ['draft-script', 'recorded'],
  recorded: ['aligned'],
  aligned: ['storyboarded'],
  storyboarded: ['rendering'],
  rendering: ['qa'],
  qa: ['rendering', 'done'],
  done: ['draft-script'],
}

export class ArtifactValidationError extends Error {
  readonly issues: readonly string[]

  constructor(artifact: string, issues: readonly string[]) {
    super(`Invalid ${artifact}:\n- ${issues.join('\n- ')}`)
    this.name = 'ArtifactValidationError'
    this.issues = issues
  }
}

export function canTransition(from: WorkflowStage, to: WorkflowStage): boolean {
  return transitions[from].includes(to)
}

export function transitionProject(
  project: VideoProjectManifest,
  to: WorkflowStage,
  now = new Date().toISOString(),
): VideoProjectManifest {
  if (!canTransition(project.stage, to)) {
    throw new Error(`Invalid Videooo workflow transition: ${project.stage} -> ${to}`)
  }

  return { ...project, stage: to, updatedAt: now }
}

export function createProject(
  topic: string,
  options: { id?: string; now?: string; brief?: ProjectBrief } = {},
): VideoProjectManifest {
  const normalizedTopic = topic.trim()
  if (normalizedTopic.length === 0) {
    throw new Error('Topic must not be empty')
  }

  const now = options.now ?? new Date().toISOString()
  const slug = normalizedTopic
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48)
  const id = options.id ?? (slug || 'video')

  return {
    schemaVersion: 1,
    id,
    topic: normalizedTopic,
    stage: 'topic',
    createdAt: now,
    updatedAt: now,
    ...(options.brief === undefined ? {} : { brief: options.brief }),
  }
}

export function parseResearchPack(
  value: unknown,
  project: VideoProjectManifest,
): ResearchPack {
  const shapeIssues = validateResearchShape(value)
  if (shapeIssues.length > 0) {
    throw new ArtifactValidationError('Research Pack', shapeIssues)
  }

  const pack = value as ResearchPack
  const semanticIssues = validateResearchPack(pack, project)
  if (semanticIssues.length > 0) {
    throw new ArtifactValidationError('Research Pack', semanticIssues)
  }

  return pack
}

export function validateResearchPack(
  pack: ResearchPack,
  project: VideoProjectManifest,
): string[] {
  const issues: string[] = []

  if (pack.projectId !== project.id) {
    issues.push(`projectId must be "${project.id}"`)
  }
  if (pack.topic.trim() !== project.topic.trim()) {
    issues.push('topic must match the project topic')
  }

  const sourceIds = collectUniqueIds(pack.sources, 'source', issues)
  const claimIds = collectUniqueIds(pack.claims, 'claim', issues)
  collectUniqueIds(pack.definitions, 'definition', issues)
  collectUniqueIds(pack.examples, 'example', issues)
  collectUniqueIds(pack.misconceptions, 'misconception', issues)
  collectUniqueIds(pack.visualOpportunities, 'visual opportunity', issues)

  for (const source of pack.sources) {
    try {
      const url = new URL(source.url)
      if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        issues.push(`source "${source.id}" URL must use http or https`)
      }
    } catch {
      issues.push(`source "${source.id}" has an invalid URL`)
    }
  }

  for (const claim of pack.claims) {
    if (claim.kind === 'fact' && claim.sourceIds.length === 0) {
      issues.push(`fact claim "${claim.id}" requires at least one source`)
    }
    addUnknownReferences(
      claim.sourceIds,
      sourceIds,
      `claim "${claim.id}" source`,
      issues,
    )
  }

  for (const definition of pack.definitions) {
    addUnknownReferences(
      definition.sourceIds,
      sourceIds,
      `definition "${definition.id}" source`,
      issues,
    )
  }

  for (const example of pack.examples) {
    addUnknownReferences(
      example.relatedClaimIds,
      claimIds,
      `example "${example.id}" claim`,
      issues,
    )
  }

  for (const misconception of pack.misconceptions) {
    addUnknownReferences(
      misconception.relatedClaimIds,
      claimIds,
      `misconception "${misconception.id}" claim`,
      issues,
    )
  }

  for (const opportunity of pack.visualOpportunities) {
    addUnknownReferences(
      opportunity.relatedClaimIds,
      claimIds,
      `visual opportunity "${opportunity.id}" claim`,
      issues,
    )
  }

  return issues
}

export function parseScriptVersion(
  value: unknown,
  project: VideoProjectManifest,
  research: ResearchPack,
  previous: ScriptVersion | null,
): ScriptVersion {
  const shapeIssues = validateScriptShape(value)
  if (shapeIssues.length > 0) {
    throw new ArtifactValidationError('Script Version', shapeIssues)
  }

  const script = value as ScriptVersion
  const semanticIssues = validateScriptVersion(script, project, research, previous)
  if (semanticIssues.length > 0) {
    throw new ArtifactValidationError('Script Version', semanticIssues)
  }

  return script
}

export function validateScriptVersion(
  script: ScriptVersion,
  project: VideoProjectManifest,
  research: ResearchPack,
  previous: ScriptVersion | null,
): string[] {
  const issues: string[] = []

  if (script.projectId !== project.id) {
    issues.push(`projectId must be "${project.id}"`)
  }
  if (project.researchPackId === undefined) {
    issues.push('project has no accepted Research Pack')
  }
  if (script.researchPackId !== research.id || script.researchPackId !== project.researchPackId) {
    issues.push('researchPackId must match the current Research Pack')
  }

  if (previous === null) {
    if (script.version !== 1) {
      issues.push('first script version must be version 1')
    }
    if (script.parentVersionId !== undefined) {
      issues.push('first script version must not have parentVersionId')
    }
  } else {
    if (script.version !== previous.version + 1) {
      issues.push(`version must be ${previous.version + 1}`)
    }
    if (script.parentVersionId !== previous.id) {
      issues.push(`parentVersionId must be "${previous.id}"`)
    }
  }

  const sectionIds = collectUniqueIds(script.sections, 'script section', issues)
  void sectionIds
  const claimIds = new Set(research.claims.map((claim) => claim.id))

  for (const section of script.sections) {
    addUnknownReferences(
      section.researchClaimIds,
      claimIds,
      `section "${section.id}" claim`,
      issues,
    )
  }

  return issues
}

export function acceptScriptVersion(
  project: VideoProjectManifest,
  now = new Date().toISOString(),
): VideoProjectManifest {
  if (project.stage === 'draft-script') {
    return transitionProject(project, 'script-review', now)
  }
  if (project.stage === 'script-review') {
    return { ...project, updatedAt: now }
  }
  throw new Error(
    `Script import requires stage "draft-script" or "script-review"; current stage is "${project.stage}"`,
  )
}

export function approveScriptVersion(
  project: VideoProjectManifest,
  script: ScriptVersion,
  now = new Date().toISOString(),
): VideoProjectManifest {
  if (project.stage !== 'script-review') {
    throw new Error(
      `Script approval requires stage "script-review"; current stage is "${project.stage}"`,
    )
  }
  if (script.projectId !== project.id) {
    throw new Error('Cannot approve a script from another project')
  }
  if (script.researchPackId !== project.researchPackId) {
    throw new Error('Cannot approve a script from a different Research Pack')
  }

  return transitionProject(
    {
      ...project,
      approvedScriptVersionId: script.id,
      approvedScriptAt: now,
    },
    'approved',
    now,
  )
}

function validateResearchShape(value: unknown): string[] {
  const issues: string[] = []
  if (!isRecord(value)) {
    return ['artifact must be a JSON object']
  }

  if (value.schemaVersion !== 1) issues.push('schemaVersion must be 1')
  requireString(value.id, 'id', issues)
  requireString(value.projectId, 'projectId', issues)
  requireString(value.topic, 'topic', issues)
  requireString(value.createdAt, 'createdAt', issues)
  requireStringArray(value.questions, 'questions', issues)
  requireStringArray(value.unresolved, 'unresolved', issues)

  validateObjectArray(value.sources, 'sources', issues, (item, path) => {
    requireString(item.id, `${path}.id`, issues)
    requireString(item.title, `${path}.title`, issues)
    requireString(item.url, `${path}.url`, issues)
    requireString(item.accessedAt, `${path}.accessedAt`, issues)
    if (
      item.sourceType !== 'primary' &&
      item.sourceType !== 'secondary' &&
      item.sourceType !== 'community' &&
      item.sourceType !== 'other'
    ) {
      issues.push(`${path}.sourceType is invalid`)
    }
  })

  validateObjectArray(value.claims, 'claims', issues, (item, path) => {
    requireString(item.id, `${path}.id`, issues)
    requireString(item.text, `${path}.text`, issues)
    requireStringArray(item.sourceIds, `${path}.sourceIds`, issues)
    if (
      item.confidence !== 'high' &&
      item.confidence !== 'medium' &&
      item.confidence !== 'low'
    ) {
      issues.push(`${path}.confidence is invalid`)
    }
    if (
      item.kind !== 'fact' &&
      item.kind !== 'interpretation' &&
      item.kind !== 'contested'
    ) {
      issues.push(`${path}.kind is invalid`)
    }
  })

  validateObjectArray(value.definitions, 'definitions', issues, (item, path) => {
    requireString(item.id, `${path}.id`, issues)
    requireString(item.term, `${path}.term`, issues)
    requireString(item.definition, `${path}.definition`, issues)
    requireStringArray(item.sourceIds, `${path}.sourceIds`, issues)
  })

  validateObjectArray(value.examples, 'examples', issues, (item, path) => {
    requireString(item.id, `${path}.id`, issues)
    requireString(item.description, `${path}.description`, issues)
    requireStringArray(item.relatedClaimIds, `${path}.relatedClaimIds`, issues)
  })

  validateObjectArray(
    value.misconceptions,
    'misconceptions',
    issues,
    (item, path) => {
      requireString(item.id, `${path}.id`, issues)
      requireString(item.misconception, `${path}.misconception`, issues)
      requireString(item.correction, `${path}.correction`, issues)
      requireStringArray(item.relatedClaimIds, `${path}.relatedClaimIds`, issues)
    },
  )

  validateObjectArray(
    value.visualOpportunities,
    'visualOpportunities',
    issues,
    (item, path) => {
      requireString(item.id, `${path}.id`, issues)
      requireString(item.description, `${path}.description`, issues)
      requireStringArray(item.relatedClaimIds, `${path}.relatedClaimIds`, issues)
      if (
        item.suggestedKind !== undefined &&
        item.suggestedKind !== 'diagram' &&
        item.suggestedKind !== 'equation' &&
        item.suggestedKind !== 'chart' &&
        item.suggestedKind !== 'concept-animation' &&
        item.suggestedKind !== 'code' &&
        item.suggestedKind !== 'comparison'
      ) {
        issues.push(`${path}.suggestedKind is invalid`)
      }
    },
  )

  return issues
}

function validateScriptShape(value: unknown): string[] {
  const issues: string[] = []
  if (!isRecord(value)) {
    return ['artifact must be a JSON object']
  }

  if (value.schemaVersion !== 1) issues.push('schemaVersion must be 1')
  requireString(value.id, 'id', issues)
  requireString(value.projectId, 'projectId', issues)
  requireString(value.researchPackId, 'researchPackId', issues)
  requireString(value.createdAt, 'createdAt', issues)

  if (!Number.isInteger(value.version) || Number(value.version) < 1) {
    issues.push('version must be a positive integer')
  }
  if (value.parentVersionId !== undefined) {
    requireString(value.parentVersionId, 'parentVersionId', issues)
  }
  if (value.changeSummary !== undefined) {
    requireString(value.changeSummary, 'changeSummary', issues)
  }

  validateObjectArray(value.sections, 'sections', issues, (item, path) => {
    requireString(item.id, `${path}.id`, issues)
    requireString(item.purpose, `${path}.purpose`, issues)
    requireString(item.narration, `${path}.narration`, issues)
    requireStringArray(item.researchClaimIds, `${path}.researchClaimIds`, issues)
    requireStringArray(item.visualHints, `${path}.visualHints`, issues)
  })

  return issues
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function requireString(value: unknown, path: string, issues: string[]): void {
  if (typeof value !== 'string' || value.trim().length === 0) {
    issues.push(`${path} must be a non-empty string`)
  }
}

function requireStringArray(value: unknown, path: string, issues: string[]): void {
  if (!Array.isArray(value)) {
    issues.push(`${path} must be an array`)
    return
  }

  for (const [index, item] of value.entries()) {
    requireString(item, `${path}[${index}]`, issues)
  }
}

function validateObjectArray(
  value: unknown,
  path: string,
  issues: string[],
  validate: (item: Record<string, unknown>, path: string) => void,
): void {
  if (!Array.isArray(value)) {
    issues.push(`${path} must be an array`)
    return
  }

  for (const [index, item] of value.entries()) {
    if (!isRecord(item)) {
      issues.push(`${path}[${index}] must be an object`)
      continue
    }
    validate(item, `${path}[${index}]`)
  }
}

function collectUniqueIds(
  values: readonly { id: string }[],
  kind: string,
  issues: string[],
): Set<string> {
  const ids = new Set<string>()
  for (const value of values) {
    if (ids.has(value.id)) {
      issues.push(`duplicate ${kind} id "${value.id}"`)
    }
    ids.add(value.id)
  }
  return ids
}

function addUnknownReferences(
  references: readonly string[],
  known: ReadonlySet<string>,
  label: string,
  issues: string[],
): void {
  for (const reference of references) {
    if (!known.has(reference)) {
      issues.push(`${label} references unknown id "${reference}"`)
    }
  }
}
