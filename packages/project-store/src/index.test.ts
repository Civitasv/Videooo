import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type {
  ResearchPack,
  ScriptVersion,
  VideoProjectManifest,
} from '@videooo/domain'
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

  function script(version: number): ScriptVersion {
    return {
      schemaVersion: 1,
      id: `script-${version}`,
      projectId: 'demo',
      version,
      ...(version === 1 ? {} : { parentVersionId: `script-${version - 1}` }),
      researchPackId: 'research-001',
      createdAt: '2026-10-01T00:02:00.000Z',
      sections: [
        {
          id: 'section-1',
          purpose: 'Explain the idea.',
          narration: 'This is the narration.',
          researchClaimIds: [],
          visualHints: [],
        },
      ],
    }
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

  it('appends and lists immutable script versions in order', async () => {
    const store = new ProjectStore(await makeDirectory())
    await store.initialize(project)

    await store.appendScriptVersion(script(1))
    await store.appendScriptVersion(script(2))

    expect(await store.listScriptVersions()).toEqual([1, 2])
    expect(await store.loadLatestScriptVersion()).toEqual(script(2))
    await expect(store.appendScriptVersion(script(2))).rejects.toThrow(
      'Script version 2 already exists',
    )
  })
})
