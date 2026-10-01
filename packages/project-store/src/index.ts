import { randomUUID } from 'node:crypto'
import {
  access,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import type {
  ResearchPack,
  ScriptVersion,
  VideoProjectManifest,
} from '@videooo/domain'

export class ProjectStore {
  readonly directory: string

  constructor(workdir = process.cwd()) {
    this.directory = resolve(workdir, '.videooo')
  }

  get projectPath(): string {
    return resolve(this.directory, 'project.json')
  }

  get researchPath(): string {
    return resolve(this.directory, 'research.json')
  }

  get scriptsDirectory(): string {
    return resolve(this.directory, 'scripts')
  }

  scriptPath(version: number): string {
    if (!Number.isInteger(version) || version < 1) {
      throw new Error('Script version must be a positive integer')
    }
    return resolve(this.scriptsDirectory, `v${String(version).padStart(3, '0')}.json`)
  }

  async initialize(project: VideoProjectManifest): Promise<void> {
    if (await pathExists(this.projectPath)) {
      throw new Error(`Videooo project already exists at ${this.directory}`)
    }

    await mkdir(this.directory, { recursive: true })
    await writeJsonAtomic(this.projectPath, project)
  }

  async loadProject(): Promise<VideoProjectManifest> {
    return readJson<VideoProjectManifest>(this.projectPath)
  }

  async saveProject(project: VideoProjectManifest): Promise<void> {
    await writeJsonAtomic(this.projectPath, project)
  }

  async hasResearch(): Promise<boolean> {
    return pathExists(this.researchPath)
  }

  async loadResearch(): Promise<ResearchPack> {
    return readJson<ResearchPack>(this.researchPath)
  }

  async saveResearch(pack: ResearchPack): Promise<void> {
    if (await pathExists(this.researchPath)) {
      throw new Error('Research Pack already exists; M1 does not replace research')
    }

    await writeJsonAtomic(this.researchPath, pack)
  }

  async listScriptVersions(): Promise<number[]> {
    if (!(await pathExists(this.scriptsDirectory))) {
      return []
    }

    const versions: number[] = []
    for (const entry of await readdir(this.scriptsDirectory, {
      withFileTypes: true,
    })) {
      if (!entry.isFile()) continue
      const match = /^v(\d+)\.json$/.exec(entry.name)
      if (match === null) continue
      const version = Number(match[1])
      if (Number.isSafeInteger(version) && version > 0) {
        versions.push(version)
      }
    }

    return versions.sort((left, right) => left - right)
  }

  async loadScriptVersion(version: number): Promise<ScriptVersion> {
    return readJson<ScriptVersion>(this.scriptPath(version))
  }

  async loadLatestScriptVersion(): Promise<ScriptVersion | null> {
    const versions = await this.listScriptVersions()
    const latest = versions.at(-1)
    return latest === undefined ? null : this.loadScriptVersion(latest)
  }

  async appendScriptVersion(script: ScriptVersion): Promise<void> {
    const path = this.scriptPath(script.version)
    if (await pathExists(path)) {
      throw new Error(`Script version ${script.version} already exists`)
    }

    await writeJsonAtomic(path, script)
  }
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, 'utf8')) as T
}

async function writeJsonAtomic(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  const temporaryPath = `${path}.${process.pid}.${randomUUID()}.tmp`

  try {
    await writeFile(temporaryPath, JSON.stringify(value, null, 2) + '\n', {
      encoding: 'utf8',
      flag: 'wx',
    })
    await rename(temporaryPath, path)
  } finally {
    await rm(temporaryPath, { force: true })
  }
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}
