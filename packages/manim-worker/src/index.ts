import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import {
  copyFile,
  mkdir,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import type {
  AlgorithmSceneContent,
  EquationSceneContent,
  PlotSceneContent,
  SceneIR,
  SceneRenderAsset,
  VectorSceneContent,
  VideoFormat,
  VideoStyle,
} from '@videooo/domain'

const TEMPLATE_VERSION = 'm4-v1'

export interface ManimWorkerOptions {
  binary?: string
  ffprobeBinary?: string
}

export interface RenderManimSceneInput {
  scene: SceneIR
  style: VideoStyle
  video: VideoFormat
  generatedDirectory: string
  mediaDirectory: string
  outputDirectory: string
}

export class ManimWorker {
  private readonly binary: string
  private readonly ffprobeBinary: string

  constructor(options: ManimWorkerOptions = {}) {
    this.binary =
      options.binary ?? process.env.VIDEOOO_MANIM_BIN ?? 'manim'
    this.ffprobeBinary =
      options.ffprobeBinary ??
      process.env.VIDEOOO_FFPROBE_BIN ??
      'ffprobe'
  }

  check(): { version: string; binary: string } {
    const output = runCapture(this.binary, ['--version'], 'Manim')
    const version = parseManimVersion(output)
    if (!/^0\.21\./.test(version)) {
      throw new Error(
        `Videooo M4 expects Manim 0.21.x, found ${version}. Set VIDEOOO_MANIM_BIN to a compatible executable.`,
      )
    }
    return { version, binary: this.binary }
  }

  async render(input: RenderManimSceneInput): Promise<SceneRenderAsset> {
    if (input.scene.renderer !== 'manim') {
      throw new Error(
        `Scene "${input.scene.id}" is routed to ${input.scene.renderer}, not Manim`,
      )
    }

    const { version } = this.check()
    const cacheKey = manimSceneCacheKey(
      input.scene,
      input.style,
      input.video,
      version,
    )
    const outputFileName = `${safeFileName(input.scene.id)}.mp4`
    const outputPath = resolve(input.outputDirectory, outputFileName)
    const cachePath = `${outputPath}.cache-key`

    if (
      (await fileExists(outputPath)) &&
      (await readText(cachePath)) === cacheKey
    ) {
      const info = await stat(outputPath)
      if (info.isFile() && info.size > 0) {
        return buildAsset(input, outputFileName, cacheKey, version)
      }
    }

    const generatedDirectory = resolve(input.generatedDirectory)
    const mediaDirectory = resolve(input.mediaDirectory)
    await mkdir(generatedDirectory, { recursive: true })
    await mkdir(mediaDirectory, { recursive: true })
    await mkdir(resolve(input.outputDirectory), { recursive: true })

    const sourcePath = resolve(
      generatedDirectory,
      `${safeFileName(input.scene.id)}.py`,
    )
    const source = generateManimSource(
      input.scene,
      input.style,
      input.video,
    )
    await writeFile(sourcePath, source, 'utf8')

    const isolatedMediaDirectory = resolve(
      mediaDirectory,
      safeFileName(input.scene.id),
    )
    await rm(isolatedMediaDirectory, { recursive: true, force: true })
    await mkdir(isolatedMediaDirectory, { recursive: true })

    const seed = stableSeed(input.scene.id)
    runCommand(
      this.binary,
      [
        'render',
        '--renderer',
        'cairo',
        '--format',
        'mp4',
        '--media_dir',
        isolatedMediaDirectory,
        '--output_file',
        safeFileName(input.scene.id),
        '--seed',
        String(seed),
        '--resolution',
        `${input.video.width},${input.video.height}`,
        '--fps',
        String(input.video.fps),
        '--progress_bar',
        'none',
        sourcePath,
        'VideoooScene',
      ],
      `Manim render for scene "${input.scene.id}"`,
    )

    const rendered = await findNamedFile(
      isolatedMediaDirectory,
      outputFileName,
    )
    if (rendered === null) {
      throw new Error(
        `Manim did not produce expected output "${outputFileName}"`,
      )
    }

    await copyFile(rendered, outputPath)
    const outputStat = await stat(outputPath)
    if (!outputStat.isFile() || outputStat.size <= 0) {
      throw new Error(
        `Manim produced an empty output for scene "${input.scene.id}"`,
      )
    }

    verifyDuration(
      this.ffprobeBinary,
      outputPath,
      input.scene.durationMs,
      input.video.fps,
    )
    await writeFile(cachePath, cacheKey, 'utf8')

    return buildAsset(input, outputFileName, cacheKey, version)
  }
}

export function generateManimSource(
  scene: SceneIR,
  style: VideoStyle,
  video: VideoFormat,
): string {
  if (scene.renderer !== 'manim') {
    throw new Error('Manim source requires a Manim-routed scene')
  }

  const duration = scene.durationMs / 1000
  const payload = JSON.stringify(scene.content)
  const stylePayload = JSON.stringify(style)

  return `from manim import *
import json

CONTENT = json.loads(${pythonString(payload)})
STYLE = json.loads(${pythonString(stylePayload)})
TARGET_DURATION = ${duration.toFixed(6)}
FPS = ${video.fps}

config.background_color = STYLE["background"]

class VideoooScene(Scene):
    def construct(self):
        started = self.renderer.time
        kind = CONTENT["type"]

        if kind == "equation":
            self.render_equation()
        elif kind == "plot":
            self.render_plot()
        elif kind == "vector":
            self.render_vector()
        elif kind == "algorithm":
            self.render_algorithm()
        else:
            raise ValueError(f"Unsupported Videooo Manim kind: {kind}")

        elapsed = self.renderer.time - started
        remaining = TARGET_DURATION - elapsed
        if remaining > 0:
            self.wait(remaining)

    def add_title(self, text):
        if not text:
            return None
        title = Text(text, font_size=34, color=STYLE["foreground"])
        title.to_edge(UP)
        self.add(title)
        return title

    def render_equation(self):
        self.add_title(CONTENT.get("title"))
        steps = CONTENT["steps"]
        annotations = CONTENT.get("annotations", [])
        per_step = max(0.15, TARGET_DURATION / max(1, len(steps) + 1))

        current = MathTex(steps[0], color=STYLE["foreground"]).scale(1.35)
        self.play(Write(current), run_time=min(per_step, 0.8))

        for index, step in enumerate(steps[1:], start=1):
            nxt = MathTex(step, color=STYLE["foreground"]).scale(1.35)
            self.play(
                TransformMatchingTex(current, nxt),
                run_time=min(per_step, 1.0),
            )
            current = nxt

            if index - 1 < len(annotations):
                annotation = annotations[index - 1]
                if annotation:
                    note = Text(
                        annotation,
                        font_size=28,
                        color=STYLE["accent"],
                    ).next_to(current, DOWN, buff=0.65)
                    self.play(FadeIn(note), run_time=min(0.35, per_step / 2))
                    self.play(FadeOut(note), run_time=min(0.25, per_step / 2))

    def render_plot(self):
        self.add_title(CONTENT.get("title"))
        x_range = CONTENT["xRange"]
        y_range = CONTENT["yRange"]
        axes = Axes(
            x_range=[x_range[0], x_range[1], (x_range[1] - x_range[0]) / 5],
            y_range=[y_range[0], y_range[1], (y_range[1] - y_range[0]) / 5],
            x_length=10.5,
            y_length=5.6,
            tips=False,
            axis_config={"color": STYLE["muted"]},
        )
        labels = axes.get_axis_labels(
            Text(CONTENT.get("xLabel", ""), font_size=22),
            Text(CONTENT.get("yLabel", ""), font_size=22),
        )
        self.play(Create(axes), FadeIn(labels), run_time=min(0.8, TARGET_DURATION / 3))

        palette = [STYLE["accent"], "#64D2FF", "#A78BFA", "#34D399"]
        series = CONTENT["series"]
        per_series = max(0.2, (TARGET_DURATION * 0.65) / max(1, len(series)))
        for index, item in enumerate(series):
            points = [axes.c2p(point[0], point[1]) for point in item["points"]]
            line = VMobject(color=palette[index % len(palette)], stroke_width=5)
            line.set_points_as_corners(points)
            self.play(Create(line), run_time=min(1.0, per_series))

    def render_vector(self):
        self.add_title(CONTENT.get("title"))
        x_range = CONTENT.get("xRange", [-5, 5])
        y_range = CONTENT.get("yRange", [-3, 3])
        axes = Axes(
            x_range=[x_range[0], x_range[1], 1],
            y_range=[y_range[0], y_range[1], 1],
            x_length=10.5,
            y_length=5.8,
            tips=False,
            axis_config={"color": STYLE["muted"]},
        )
        self.play(Create(axes), run_time=min(0.7, TARGET_DURATION / 3))
        vectors = CONTENT["vectors"]
        per_vector = max(0.2, (TARGET_DURATION * 0.65) / max(1, len(vectors)))

        for item in vectors:
            start = axes.c2p(item["from"][0], item["from"][1])
            end = axes.c2p(item["to"][0], item["to"][1])
            arrow = Arrow(
                start,
                end,
                buff=0,
                color=STYLE["accent"],
                stroke_width=6,
            )
            label_text = item.get("label")
            label = (
                Text(label_text, font_size=26, color=STYLE["foreground"])
                .next_to(arrow.get_end(), UR, buff=0.15)
                if label_text
                else None
            )
            animations = [GrowArrow(arrow)]
            if label is not None:
                animations.append(FadeIn(label))
            self.play(*animations, run_time=min(0.9, per_vector))

    def render_algorithm(self):
        self.add_title(CONTENT.get("title"))
        states = CONTENT["states"]
        per_state = max(0.25, TARGET_DURATION / max(1, len(states) + 1))
        current = None

        for state_index, state in enumerate(states):
            values = VGroup()
            active = set(state.get("activeIndices", []))
            for index, value in enumerate(state["values"]):
                box = RoundedRectangle(
                    corner_radius=0.12,
                    width=1.25,
                    height=0.8,
                    color=STYLE["accent"] if index in active else STYLE["muted"],
                    fill_color=STYLE["accentSoft"] if index in active else STYLE["surface"],
                    fill_opacity=1,
                )
                text = Text(str(value), font_size=28, color=STYLE["foreground"])
                values.add(VGroup(box, text))
            values.arrange(RIGHT, buff=0.18)
            label = Text(
                state["label"],
                font_size=30,
                color=STYLE["foreground"],
            ).next_to(values, UP, buff=0.5)
            group = VGroup(values, label)

            if current is None:
                self.play(FadeIn(group), run_time=min(0.7, per_state))
            else:
                self.play(Transform(current, group), run_time=min(0.8, per_state))
                group = current
            current = group
`
}

export function manimSceneCacheKey(
  scene: SceneIR,
  style: VideoStyle,
  video: VideoFormat,
  manimVersion: string,
): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        templateVersion: TEMPLATE_VERSION,
        scene,
        style,
        video,
        manimVersion,
      }),
    )
    .digest('hex')
}

export function parseManimVersion(output: string): string {
  const match = /Manim Community v?(\d+\.\d+\.\d+)/i.exec(output)
  if (match === null) {
    throw new Error(`Unable to parse Manim version from: ${output.trim()}`)
  }
  return match[1]!
}

function buildAsset(
  input: RenderManimSceneInput,
  fileName: string,
  cacheKey: string,
  manimVersion: string,
): SceneRenderAsset {
  return {
    schemaVersion: 1,
    sceneId: input.scene.id,
    renderer: 'manim',
    fileName,
    cacheKey,
    manimVersion,
    durationMs: input.scene.durationMs,
    width: input.video.width,
    height: input.video.height,
    fps: input.video.fps,
  }
}

function stableSeed(value: string): number {
  return Number.parseInt(
    createHash('sha256').update(value).digest('hex').slice(0, 8),
    16,
  ) & 0x7fffffff
}

function safeFileName(value: string): string {
  const safe = value.replace(/[^a-zA-Z0-9._-]+/g, '-')
  if (safe.length === 0) throw new Error('Scene id cannot form a filename')
  return safe
}

function pythonString(value: string): string {
  return JSON.stringify(value)
}

function runCapture(
  command: string,
  args: string[],
  label: string,
): string {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  if (result.error !== undefined || result.status !== 0) {
    throw new Error(`${label} is unavailable: ${result.stderr || result.stdout}`)
  }
  return `${result.stdout}\n${result.stderr}`
}

function runCommand(
  command: string,
  args: string[],
  label: string,
): void {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 32 * 1024 * 1024,
  })
  if (result.error !== undefined || result.status !== 0) {
    throw new Error(
      `${label} failed:\n${result.stderr || result.stdout || 'unknown error'}`,
    )
  }
}

function verifyDuration(
  ffprobeBinary: string,
  path: string,
  targetMs: number,
  fps: number,
): void {
  const output = runCapture(
    ffprobeBinary,
    [
      '-v',
      'error',
      '-show_entries',
      'format=duration',
      '-of',
      'default=noprint_wrappers=1:nokey=1',
      path,
    ],
    'ffprobe',
  ).trim()
  const seconds = Number(output)
  if (!Number.isFinite(seconds)) {
    throw new Error(`Unable to read Manim output duration: ${output}`)
  }
  const actualMs = seconds * 1000
  const tolerance = Math.max(150, 1000 / fps)
  if (Math.abs(actualMs - targetMs) > tolerance) {
    throw new Error(
      `Manim scene duration mismatch: expected ${targetMs}ms, got ${actualMs.toFixed(1)}ms`,
    )
  }
}

async function findNamedFile(
  directory: string,
  name: string,
): Promise<string | null> {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name)
    if (entry.isFile() && entry.name === name) return path
    if (entry.isDirectory()) {
      const found = await findNamedFile(path, name)
      if (found !== null) return found
    }
  }
  return null
}

async function fileExists(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile()
  } catch {
    return false
  }
}

async function readText(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf8')
  } catch {
    return null
  }
}
