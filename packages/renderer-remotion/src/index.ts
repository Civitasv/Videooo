import { copyFile, mkdir, rm, stat } from 'node:fs/promises'
import { dirname, extname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { bundle } from '@remotion/bundler'
import { renderMedia, selectComposition } from '@remotion/renderer'
import type {
  RendererAdapter,
  SceneIR,
  VideoFormat,
  VideoStyle,
} from '@videooo/domain'
import { planSceneFrames } from '@videooo/storyboard'
import type { VideoooRenderProps } from './types.js'

export const remotionRenderer: RendererAdapter = {
  kind: 'remotion',
  supports(scene: SceneIR): boolean {
    return scene.renderer === 'remotion'
  },
}

export interface RenderRemotionVideoInput {
  scenes: SceneIR[]
  style: VideoStyle
  video: VideoFormat
  durationMs: number
  narrationSourcePath?: string
  workspaceDirectory: string
  outputLocation: string
  manimSceneAssets?: Record<string, string>
  logLevel?: 'verbose' | 'info' | 'warn' | 'error'
}

export interface RenderRemotionVideoResult {
  outputLocation: string
  frameCount: number
  narrationFile: string | null
}

export async function renderRemotionVideo(
  input: RenderRemotionVideoInput,
): Promise<RenderRemotionVideoResult> {
  if (input.scenes.length === 0) {
    throw new Error('Cannot render without Scene IR')
  }

  const workspace = resolve(input.workspaceDirectory)
  const publicDirectory = resolve(workspace, 'public')
  await rm(workspace, { recursive: true, force: true })
  await mkdir(publicDirectory, { recursive: true })

  let narrationFile: string | undefined
  if (input.narrationSourcePath !== undefined) {
    const extension = safeAudioExtension(input.narrationSourcePath)
    narrationFile = `narration${extension}`
    await copyFile(
      resolve(input.narrationSourcePath),
      resolve(publicDirectory, narrationFile),
    )
  }

  const manimAssets: Record<string, string> = {}
  const manimPublicDirectory = resolve(publicDirectory, 'manim')
  for (const scene of input.scenes) {
    if (scene.renderer !== 'manim') continue

    const source = input.manimSceneAssets?.[scene.id]
    if (source === undefined) {
      throw new Error(`Missing Manim asset path for scene "${scene.id}"`)
    }

    await mkdir(manimPublicDirectory, { recursive: true })
    const fileName = `${safeAssetName(scene.id)}.mp4`
    await copyFile(resolve(source), resolve(manimPublicDirectory, fileName))
    manimAssets[scene.id] = `manim/${fileName}`
  }

  const framePlans = planSceneFrames(
    input.scenes,
    input.video.fps,
    input.durationMs,
  )
  const props: VideoooRenderProps = {
    scenes: input.scenes,
    framePlans,
    style: input.style,
    video: input.video,
    durationMs: input.durationMs,
    ...(narrationFile === undefined ? {} : { narrationFile }),
    manimAssets,
  }

  const outputLocation = resolve(input.outputLocation)
  await mkdir(dirname(outputLocation), { recursive: true })

  const entryPoint = fileURLToPath(
    new URL('./remotion-entry.js', import.meta.url),
  )

  const serveUrl = await bundle({
    entryPoint,
    publicDir: publicDirectory,
  })

  try {
    const composition = await selectComposition({
      serveUrl,
      id: 'VideoooMain',
      inputProps: props,
    })

    await renderMedia({
      composition,
      serveUrl,
      codec: 'h264',
      outputLocation,
      inputProps: props,
      logLevel: input.logLevel ?? 'info',
    })

    const outputStat = await stat(outputLocation)
    if (!outputStat.isFile() || outputStat.size <= 0) {
      throw new Error('Remotion completed without a non-empty output file')
    }

    return {
      outputLocation,
      frameCount: composition.durationInFrames,
      narrationFile: narrationFile ?? null,
    }
  } finally {
    await rm(serveUrl, { recursive: true, force: true }).catch(() => {})
  }
}

function safeAssetName(value: string): string {
  const safe = value.replace(/[^a-zA-Z0-9._-]+/g, '-')
  if (safe.length === 0) throw new Error('Scene id cannot form an asset name')
  return safe
}

function safeAudioExtension(path: string): string {
  const extension = extname(path).toLowerCase()
  return /^\.[a-z0-9]{1,10}$/.test(extension) ? extension : '.audio'
}
