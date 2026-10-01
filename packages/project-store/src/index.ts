import { randomUUID } from 'node:crypto'
import {
  access,
  mkdir,
  readFile,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import type { ResearchPack, VideoProjectManifest } from '@videooo/domain'

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
