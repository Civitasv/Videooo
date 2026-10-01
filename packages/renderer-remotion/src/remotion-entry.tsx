import { Composition, registerRoot } from 'remotion'
import { DEFAULT_VIDEO_STYLE } from '@videooo/storyboard'
import { VideoooComposition } from './composition.js'
import type { VideoooRenderProps } from './types.js'

const defaultProps: VideoooRenderProps = {
  scenes: [],
  framePlans: [],
  style: DEFAULT_VIDEO_STYLE,
  video: { width: 1920, height: 1080, fps: 30 },
  durationMs: 1000,
  narrationFile: 'narration.wav',
  manimAssets: {},
}

function VideoooRoot() {
  return (
    <Composition
      id="VideoooMain"
      component={VideoooComposition}
      durationInFrames={30}
      fps={30}
      width={1920}
      height={1080}
      defaultProps={defaultProps}
      calculateMetadata={({ props }) => ({
        durationInFrames: Math.max(
          1,
          Math.ceil((props.durationMs / 1000) * props.video.fps),
        ),
        fps: props.video.fps,
        width: props.video.width,
        height: props.video.height,
      })}
    />
  )
}

registerRoot(VideoooRoot)
