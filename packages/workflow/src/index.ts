import type { VideoProjectManifest, WorkflowStage } from '@videooo/domain'

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
  options: { id?: string; now?: string } = {},
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
  }
}
