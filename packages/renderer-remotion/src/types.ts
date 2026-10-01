import type {
  SceneFramePlan,
  SceneIR,
  VideoFormat,
  VideoStyle,
} from '@videooo/domain'

export interface VideoooRenderProps {
  scenes: SceneIR[]
  framePlans: SceneFramePlan[]
  style: VideoStyle
  video: VideoFormat
  durationMs: number
  narrationFile: string
}
