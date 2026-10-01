import type {
  SceneFramePlan,
  SceneIR,
  VideoFormat,
  VideoStyle,
} from '@videooo/domain'

export interface VideoooRenderProps extends Record<string, unknown> {
  scenes: SceneIR[]
  framePlans: SceneFramePlan[]
  style: VideoStyle
  video: VideoFormat
  durationMs: number
  narrationFile?: string
  manimAssets: Record<string, string>
}
