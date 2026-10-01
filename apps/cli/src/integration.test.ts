import { spawnSync } from 'node:child_process'
import { access, mkdir, mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'

const roots: string[] = []
const cliPath = fileURLToPath(new URL('../.build/index.js', import.meta.url))
const sourceProjectPath = fileURLToPath(
  new URL('../../../.videooo/project.json', import.meta.url),
)

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) =>
      rm(root, { recursive: true, force: true }),
    ),
  )
})

describe('Videooo CLI distribution behavior', () => {
  it('reports help and package version from an unrelated cwd', async () => {
    const root = await makeRoot()
    expect(run(root, ['--version'])).toBe('0.1.0')
    expect(run(root, ['--help'])).toContain('videooo init <topic>')
  })

  it('creates independent projects in unrelated working directories', async () => {
    const root = await makeRoot()
    const projectA = join(root, 'video-a')
    const projectB = join(root, 'video-b')
    await mkdir(projectA)
    await mkdir(projectB)

    const sourceBefore = await readOptional(sourceProjectPath)

    run(projectA, ['init', 'Attention'])
    run(projectB, ['init', 'Diffusion'])

    const manifestA = JSON.parse(
      await readFile(join(projectA, '.videooo', 'project.json'), 'utf8'),
    ) as { id: string; topic: string }
    const manifestB = JSON.parse(
      await readFile(join(projectB, '.videooo', 'project.json'), 'utf8'),
    ) as { id: string; topic: string }

    expect(manifestA).toMatchObject({ id: 'attention', topic: 'Attention' })
    expect(manifestB).toMatchObject({ id: 'diffusion', topic: 'Diffusion' })

    const statusA = JSON.parse(run(projectA, ['status'])) as {
      projectId: string
      topic: string
    }
    const statusB = JSON.parse(run(projectB, ['status'])) as {
      projectId: string
      topic: string
    }

    expect(statusA).toMatchObject({ projectId: 'attention', topic: 'Attention' })
    expect(statusB).toMatchObject({ projectId: 'diffusion', topic: 'Diffusion' })

    for (const project of [projectA, projectB]) {
      expect(await exists(join(project, 'package.json'))).toBe(false)
      expect(await exists(join(project, 'node_modules'))).toBe(false)
      expect(await exists(join(project, 'skills'))).toBe(false)
    }

    expect(await readOptional(sourceProjectPath)).toBe(sourceBefore)
  })
})

async function makeRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'videooo-cli-'))
  roots.push(root)
  return root
}

function run(cwd: string, args: string[]): string {
  const result = spawnSync(process.execPath, [cliPath, ...args], {
    cwd,
    encoding: 'utf8',
  })

  if (result.status !== 0) {
    throw new Error(
      `videooo ${args.join(' ')} failed:\n${result.stderr}\n${result.stdout}`,
    )
  }

  return result.stdout.trim()
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

async function readOptional(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf8')
  } catch {
    return null
  }
}
