import { createHash, randomUUID } from 'node:crypto'
import { createReadStream } from 'node:fs'
import {
  access,
  copyFile,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises'
import { basename, dirname, extname, resolve } from 'node:path'
import type {
  NarrationAlignment,
  NarrationAsset,
  QaEvidencePack,
  QaReport,
  QaReviewArtifact,
  ResearchPack,
  SceneIR,
  SceneRenderAsset,
  SceneRenderIndex,
  ScriptVersion,
  StoryboardArtifact,
  TranscriptArtifact,
  VideoProjectManifest,
  VideoRenderManifest,
  VideoStyle,
} from '@videooo/domain'

export interface ImportNarrationInput {
  projectId: string
  scriptVersionId: string
  importedAt?: string
}

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

  get narrationDirectory(): string {
    return resolve(this.directory, 'narration')
  }

  get narrationMetadataPath(): string {
    return resolve(this.narrationDirectory, 'narration.json')
  }

  get normalizedNarrationPath(): string {
    return resolve(this.narrationDirectory, 'normalized.wav')
  }

  get transcriptPath(): string {
    return resolve(this.narrationDirectory, 'transcript.json')
  }

  get alignmentPath(): string {
    return resolve(this.narrationDirectory, 'alignment.json')
  }

  get storyboardPath(): string {
    return resolve(this.directory, 'storyboard.json')
  }

  get stylePath(): string {
    return resolve(this.directory, 'style.json')
  }

  get scenesDirectory(): string {
    return resolve(this.directory, 'scenes')
  }

  get rendersDirectory(): string {
    return resolve(this.directory, 'renders')
  }

  get draftRenderPath(): string {
    return resolve(this.rendersDirectory, 'draft.mp4')
  }

  get finalRenderPath(): string {
    return resolve(this.rendersDirectory, 'final.mp4')
  }

  get qaDirectory(): string {
    return resolve(this.directory, 'qa')
  }

  get renderManifestPath(): string {
    return resolve(this.rendersDirectory, 'render.json')
  }

  get renderWorkspaceDirectory(): string {
    return resolve(this.directory, 'render-workspace')
  }

  get manimGeneratedDirectory(): string {
    return resolve(this.directory, 'manim', 'generated')
  }

  get manimMediaDirectory(): string {
    return resolve(this.directory, 'manim', 'media')
  }

  get sceneRendersDirectory(): string {
    return resolve(this.rendersDirectory, 'scenes')
  }

  get sceneRenderIndexPath(): string {
    return resolve(this.sceneRendersDirectory, 'index.json')
  }

  sceneRenderPath(sceneId: string): string {
    return resolve(
      this.sceneRendersDirectory,
      `${sceneId.replace(/[^a-zA-Z0-9._-]+/g, '-')}.mp4`,
    )
  }

  qaRunDirectory(runId: string): string {
    return resolve(this.qaDirectory, validateQaRunId(runId))
  }

  qaFramesDirectory(runId: string): string {
    return resolve(this.qaRunDirectory(runId), 'frames')
  }

  qaEvidencePath(runId: string): string {
    return resolve(this.qaRunDirectory(runId), 'evidence.json')
  }

  qaReviewPath(runId: string): string {
    return resolve(this.qaRunDirectory(runId), 'review.json')
  }

  qaReportPath(runId: string): string {
    return resolve(this.qaRunDirectory(runId), 'report.json')
  }

  scenePath(index: number): string {
    return resolve(
      this.scenesDirectory,
      `scene_${String(index + 1).padStart(3, '0')}.json`,
    )
  }

  narrationSourcePath(asset: NarrationAsset): string {
    return resolve(this.narrationDirectory, asset.storedFileName)
  }

  scriptPath(version: number): string {
    if (!Number.isInteger(version) || version < 1) {
      throw new Error('Script version must be a positive integer')
    }
    return resolve(
      this.scriptsDirectory,
      `v${String(version).padStart(3, '0')}.json`,
    )
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

  async loadScriptVersionById(id: string): Promise<ScriptVersion> {
    for (const version of await this.listScriptVersions()) {
      const script = await this.loadScriptVersion(version)
      if (script.id === id) return script
    }
    throw new Error(`Script version "${id}" does not exist`)
  }

  async appendScriptVersion(script: ScriptVersion): Promise<void> {
    const path = this.scriptPath(script.version)
    if (await pathExists(path)) {
      throw new Error(`Script version ${script.version} already exists`)
    }

    await writeJsonAtomic(path, script)
  }

  async hasNarration(): Promise<boolean> {
    return pathExists(this.narrationMetadataPath)
  }

  async importNarrationSource(
    sourcePath: string,
    input: ImportNarrationInput,
  ): Promise<NarrationAsset> {
    if (await this.hasNarration()) {
      throw new Error('Narration already exists; M2 does not replace narration')
    }

    const absoluteSource = resolve(sourcePath)
    const sourceStat = await stat(absoluteSource)
    if (!sourceStat.isFile()) {
      throw new Error('Narration source must be a regular file')
    }

    const extension = safeExtension(absoluteSource)
    const storedFileName = `source${extension}`
    const targetPath = resolve(this.narrationDirectory, storedFileName)
    const temporaryPath = `${targetPath}.${randomUUID()}.tmp`
    const sha256 = await sha256File(absoluteSource)

    const mediaType = mediaTypeForExtension(extension)
    const asset: NarrationAsset = {
      schemaVersion: 1,
      id: `narration-${sha256.slice(0, 16)}`,
      projectId: input.projectId,
      scriptVersionId: input.scriptVersionId,
      importedAt: input.importedAt ?? new Date().toISOString(),
      sourceFileName: basename(absoluteSource),
      storedFileName,
      sha256,
      byteLength: sourceStat.size,
      ...(mediaType === undefined ? {} : { mediaType }),
    }

    await mkdir(this.narrationDirectory, { recursive: true })
    try {
      await copyFile(absoluteSource, temporaryPath)
      await rename(temporaryPath, targetPath)
      await writeJsonAtomic(this.narrationMetadataPath, asset)
    } catch (error) {
      await rm(temporaryPath, { force: true })
      if (!(await pathExists(this.narrationMetadataPath))) {
        await rm(targetPath, { force: true })
      }
      throw error
    }

    return asset
  }

  async loadNarration(): Promise<NarrationAsset> {
    return readJson<NarrationAsset>(this.narrationMetadataPath)
  }

  async hasTranscript(): Promise<boolean> {
    return pathExists(this.transcriptPath)
  }

  async saveTranscript(transcript: TranscriptArtifact): Promise<void> {
    if (await this.hasTranscript()) {
      throw new Error('Transcript already exists; M2 does not replace transcript')
    }
    await writeJsonAtomic(this.transcriptPath, transcript)
  }

  async loadTranscript(): Promise<TranscriptArtifact> {
    return readJson<TranscriptArtifact>(this.transcriptPath)
  }

  async hasAlignment(): Promise<boolean> {
    return pathExists(this.alignmentPath)
  }

  async saveAlignment(
    alignment: NarrationAlignment,
    options: { replace?: boolean } = {},
  ): Promise<void> {
    if ((await this.hasAlignment()) && options.replace !== true) {
      throw new Error('Alignment already exists')
    }
    await writeJsonAtomic(this.alignmentPath, alignment)
  }

  async loadAlignment(): Promise<NarrationAlignment> {
    return readJson<NarrationAlignment>(this.alignmentPath)
  }

  async hasStoryboard(): Promise<boolean> {
    return pathExists(this.storyboardPath)
  }

  async saveStoryboard(storyboard: StoryboardArtifact): Promise<void> {
    if (await this.hasStoryboard()) {
      throw new Error('Storyboard already exists; M3 does not replace storyboard')
    }
    await writeJsonAtomic(this.storyboardPath, storyboard)
  }

  async loadStoryboard(): Promise<StoryboardArtifact> {
    return readJson<StoryboardArtifact>(this.storyboardPath)
  }

  async hasStyle(): Promise<boolean> {
    return pathExists(this.stylePath)
  }

  async saveStyle(style: VideoStyle): Promise<void> {
    await writeJsonAtomic(this.stylePath, style)
  }

  async loadStyle(): Promise<VideoStyle> {
    return readJson<VideoStyle>(this.stylePath)
  }

  async saveScenes(scenes: readonly SceneIR[]): Promise<void> {
    await rm(this.scenesDirectory, { recursive: true, force: true })
    await mkdir(this.scenesDirectory, { recursive: true })

    for (const [index, scene] of scenes.entries()) {
      await writeJsonAtomic(this.scenePath(index), scene)
    }
  }

  async listScenes(): Promise<SceneIR[]> {
    if (!(await pathExists(this.scenesDirectory))) return []
    const names = (await readdir(this.scenesDirectory))
      .filter((name) => /^scene_\d+\.json$/.test(name))
      .sort()
    return Promise.all(
      names.map((name) => readJson<SceneIR>(resolve(this.scenesDirectory, name))),
    )
  }

  async loadScene(id: string): Promise<SceneIR> {
    for (const scene of await this.listScenes()) {
      if (scene.id === id) return scene
    }
    throw new Error(`Scene "${id}" does not exist`)
  }

  async saveRenderManifest(manifest: VideoRenderManifest): Promise<void> {
    await writeJsonAtomic(this.renderManifestPath, manifest)
  }

  async loadRenderManifest(): Promise<VideoRenderManifest> {
    return readJson<VideoRenderManifest>(this.renderManifestPath)
  }

  async hasRenderManifest(): Promise<boolean> {
    return pathExists(this.renderManifestPath)
  }

  async loadSceneRenderIndex(): Promise<SceneRenderIndex> {
    if (!(await pathExists(this.sceneRenderIndexPath))) {
      return { schemaVersion: 1, assets: [] }
    }
    return readJson<SceneRenderIndex>(this.sceneRenderIndexPath)
  }

  async saveSceneRenderAsset(asset: SceneRenderAsset): Promise<void> {
    const index = await this.loadSceneRenderIndex()
    const assets = index.assets.filter((item) => item.sceneId !== asset.sceneId)
    assets.push(asset)
    assets.sort((left, right) => left.sceneId.localeCompare(right.sceneId))
    await writeJsonAtomic(this.sceneRenderIndexPath, {
      schemaVersion: 1,
      assets,
    })
  }

  async loadSceneRenderAsset(
    sceneId: string,
  ): Promise<SceneRenderAsset | null> {
    const index = await this.loadSceneRenderIndex()
    return index.assets.find((item) => item.sceneId === sceneId) ?? null
  }

  async nextQaRunId(): Promise<string> {
    if (!(await pathExists(this.qaDirectory))) {
      return 'run-001'
    }

    let max = 0
    for (const entry of await readdir(this.qaDirectory, {
      withFileTypes: true,
    })) {
      if (!entry.isDirectory()) continue
      const match = /^run-(\d{3,})$/.exec(entry.name)
      if (match === null) continue
      max = Math.max(max, Number(match[1]))
    }

    return `run-${String(max + 1).padStart(3, '0')}`
  }

  async saveQaEvidence(evidence: QaEvidencePack): Promise<void> {
    const path = this.qaEvidencePath(evidence.id)
    if (await pathExists(path)) {
      throw new Error(`QA evidence "${evidence.id}" already exists`)
    }
    await writeJsonAtomic(path, evidence)
  }

  async loadQaEvidence(runId: string): Promise<QaEvidencePack> {
    return readJson<QaEvidencePack>(this.qaEvidencePath(runId))
  }

  async saveQaReview(
    runId: string,
    review: QaReviewArtifact,
  ): Promise<void> {
    const path = this.qaReviewPath(runId)
    if (await pathExists(path)) {
      throw new Error(`QA review for "${runId}" already exists`)
    }
    await writeJsonAtomic(path, review)
  }

  async loadQaReview(runId: string): Promise<QaReviewArtifact> {
    return readJson<QaReviewArtifact>(this.qaReviewPath(runId))
  }

  async saveQaReport(runId: string, report: QaReport): Promise<void> {
    const path = this.qaReportPath(runId)
    if (await pathExists(path)) {
      throw new Error(`QA report for "${runId}" already exists`)
    }
    await writeJsonAtomic(path, report)
  }

  async loadQaReport(runId: string): Promise<QaReport> {
    return readJson<QaReport>(this.qaReportPath(runId))
  }

  async acceptRenderAsFinal(
    sourcePath = this.draftRenderPath,
  ): Promise<void> {
    const absoluteSource = resolve(sourcePath)
    const info = await stat(absoluteSource)
    if (!info.isFile() || info.size <= 0) {
      throw new Error('Accepted render is missing or empty')
    }
    await mkdir(this.rendersDirectory, { recursive: true })
    await copyFile(absoluteSource, this.finalRenderPath)
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

async function sha256File(path: string): Promise<string> {
  const hash = createHash('sha256')
  const stream = createReadStream(path)

  for await (const chunk of stream) {
    hash.update(chunk)
  }

  return hash.digest('hex')
}

function safeExtension(path: string): string {
  const extension = extname(path).toLowerCase()
  return /^\.[a-z0-9]{1,10}$/.test(extension) ? extension : '.audio'
}

function mediaTypeForExtension(extension: string): string | undefined {
  switch (extension) {
    case '.wav':
      return 'audio/wav'
    case '.mp3':
      return 'audio/mpeg'
    case '.m4a':
      return 'audio/mp4'
    case '.aac':
      return 'audio/aac'
    case '.flac':
      return 'audio/flac'
    case '.ogg':
      return 'audio/ogg'
    default:
      return undefined
  }
}

function validateQaRunId(value: string): string {
  if (!/^run-\d{3,}$/.test(value)) {
    throw new Error(`Invalid QA run id: ${value}`)
  }
  return value
}
