import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { ResearchPack, VideoProjectManifest } from '@videooo/domain'
import { ProjectStore } from './index.js'

const directories: string[] = []

async function makeDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'videooo-store-'))
  directories.push(directory)
  return directory
}

afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  )
})

describe('ProjectStore', () => {
  const project: VideoProjectManifest = {
    schemaVersion: 1,
    id: 'demo',
    topic: 'Demo',
    stage: 'research',
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
  }

  const research: ResearchPack = {
    schemaVersion: 1,
    id: 'research-001',
    projectId: 'demo',
    topic: 'Demo',
    createdAt: '2026-10-01T00:01:00.000Z',
    questions: [],
    sources: [],
    claims: [],
    definitions: [],
    examples: [],
    misconceptions: [],
    visualOpportunities: [],
    unresolved: [],
  }

  it('initializes and round-trips a project', async () => {
    const store = new ProjectStore(await makeDirectory())
    await store.initialize(project)

    expect(await store.loadProject()).toEqual(project)
    expect((await readFile(store.projectPath, 'utf8')).endsWith('\n')).toBe(true)
  })

  it('persists research once and rejects overwrite', async () => {
    const store = new ProjectStore(await makeDirectory())
    await store.initialize(project)

    expect(await store.hasResearch()).toBe(false)
    await store.saveResearch(research)
    expect(await store.loadResearch()).toEqual(research)
    await expect(store.saveResearch(research)).rejects.toThrow(
      'M1 does not replace research',
    )
  })
})
