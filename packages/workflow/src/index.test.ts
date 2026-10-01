import { describe, expect, it } from 'vitest'
import { canTransition, createProject, transitionProject } from './index.js'

describe('Videooo workflow', () => {
  it('requires explicit progression through script review', () => {
    expect(canTransition('draft-script', 'script-review')).toBe(true)
    expect(canTransition('draft-script', 'approved')).toBe(false)
    expect(canTransition('script-review', 'approved')).toBe(true)
  })

  it('allows QA to request a render repair loop', () => {
    expect(canTransition('qa', 'rendering')).toBe(true)
    expect(canTransition('qa', 'done')).toBe(true)
  })

  it('creates deterministic project data with deterministic inputs', () => {
    const project = createProject('Why attention needs position', {
      id: 'attention-position',
      now: '2026-10-01T00:00:00.000Z',
    })

    expect(project).toEqual({
      schemaVersion: 1,
      id: 'attention-position',
      topic: 'Why attention needs position',
      stage: 'topic',
      createdAt: '2026-10-01T00:00:00.000Z',
      updatedAt: '2026-10-01T00:00:00.000Z',
    })
  })

  it('rejects invalid jumps', () => {
    const project = createProject('Test', {
      id: 'test',
      now: '2026-10-01T00:00:00.000Z',
    })

    expect(() => transitionProject(project, 'rendering')).toThrow(
      'Invalid Videooo workflow transition: topic -> rendering',
    )
  })
})
