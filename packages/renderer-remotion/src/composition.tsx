import { Audio, Video } from '@remotion/media'
import {
  AbsoluteFill,
  Sequence,
  interpolate,
  staticFile,
  useCurrentFrame,
} from 'remotion'
import type {
  CodeSceneContent,
  DiagramSceneContent,
  SceneIR,
  SummarySceneContent,
  TitleSceneContent,
  TypographySceneContent,
  VideoStyle,
} from '@videooo/domain'
import type { VideoooRenderProps } from './types.js'

export function VideoooComposition(props: VideoooRenderProps) {
  return (
    <AbsoluteFill
      style={{
        backgroundColor: props.style.background,
        color: props.style.foreground,
        fontFamily: props.style.fontFamily,
      }}
    >
      {props.scenes.map((scene, index) => {
        const plan = props.framePlans[index]
        if (plan === undefined || plan.sceneId !== scene.id) {
          throw new Error(`Missing frame plan for scene "${scene.id}"`)
        }

        return (
          <Sequence
            key={scene.id}
            from={plan.from}
            durationInFrames={plan.durationInFrames}
            name={scene.id}
          >
            <SceneFrame
              scene={scene}
              style={props.style}
              durationInFrames={plan.durationInFrames}
              manimAsset={props.manimAssets[scene.id]}
            />
          </Sequence>
        )
      })}

      <Audio src={staticFile(props.narrationFile)} />
    </AbsoluteFill>
  )
}

function SceneFrame({
  scene,
  style,
  durationInFrames,
  manimAsset,
}: {
  scene: SceneIR
  style: VideoStyle
  durationInFrames: number
  manimAsset?: string
}) {
  const frame = useCurrentFrame()
  const motion = sceneMotion(scene, frame, durationInFrames)

  if (scene.renderer === 'manim') {
    if (manimAsset === undefined) {
      throw new Error(`Missing Manim media for scene "${scene.id}"`)
    }
    return (
      <AbsoluteFill
        style={{
          backgroundColor: style.background,
          opacity: motion.opacity,
          transform: `translateY(${motion.translateY}px)`,
        }}
      >
        <Video
          src={staticFile(manimAsset)}
          muted
          style={{ width: '100%', height: '100%', objectFit: 'contain' }}
        />
      </AbsoluteFill>
    )
  }

  return (
    <AbsoluteFill
      style={{
        backgroundColor: style.background,
        opacity: motion.opacity,
        transform: `translateY(${motion.translateY}px)`,
        padding: style.safeAreaPx,
        boxSizing: 'border-box',
        justifyContent: 'center',
      }}
    >
      {renderScene(scene, style)}
    </AbsoluteFill>
  )
}

function renderScene(scene: SceneIR, style: VideoStyle) {
  switch (scene.content.type) {
    case 'title':
      return <TitleScene content={scene.content} style={style} />
    case 'typography':
      return <TypographyScene content={scene.content} style={style} />
    case 'code':
      return <CodeScene content={scene.content} style={style} />
    case 'diagram':
      return <DiagramScene content={scene.content} style={style} />
    case 'summary':
      return <SummaryScene content={scene.content} style={style} />
  }
}

function TitleScene({
  content,
  style,
}: {
  content: TitleSceneContent
  style: VideoStyle
}) {
  return (
    <div style={{ maxWidth: 1500 }}>
      {content.eyebrow === undefined ? null : (
        <div
          style={{
            color: style.accent,
            fontSize: 34,
            fontWeight: 700,
            letterSpacing: 1.2,
            marginBottom: 28,
          }}
        >
          {content.eyebrow}
        </div>
      )}
      <div
        style={{
          fontSize: 92,
          fontWeight: 780,
          lineHeight: 1.04,
          letterSpacing: -3.5,
          whiteSpace: 'pre-wrap',
        }}
      >
        {content.title}
      </div>
      {content.subtitle === undefined ? null : (
        <div
          style={{
            color: style.muted,
            fontSize: 42,
            lineHeight: 1.3,
            marginTop: 36,
            maxWidth: 1250,
          }}
        >
          {content.subtitle}
        </div>
      )}
    </div>
  )
}

function TypographyScene({
  content,
  style,
}: {
  content: TypographySceneContent
  style: VideoStyle
}) {
  return (
    <div style={{ maxWidth: 1450 }}>
      <div
        style={{
          fontSize: 76,
          fontWeight: 760,
          lineHeight: 1.08,
          letterSpacing: -2.6,
        }}
      >
        {content.headline}
      </div>
      {content.body === undefined ? null : (
        <div
          style={{
            color: style.muted,
            fontSize: 38,
            lineHeight: 1.45,
            marginTop: 34,
            maxWidth: 1280,
            whiteSpace: 'pre-wrap',
          }}
        >
          {content.body}
        </div>
      )}
      {content.emphasis === undefined || content.emphasis.length === 0 ? null : (
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 16,
            marginTop: 40,
          }}
        >
          {content.emphasis.map((item) => (
            <div
              key={item}
              style={{
                backgroundColor: style.accentSoft,
                border: `1px solid ${style.accent}`,
                borderRadius: 999,
                color: style.accent,
                fontSize: 28,
                fontWeight: 680,
                padding: '12px 22px',
              }}
            >
              {item}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function CodeScene({
  content,
  style,
}: {
  content: CodeSceneContent
  style: VideoStyle
}) {
  const highlighted = new Set(content.highlightedLines ?? [])

  return (
    <div style={{ width: '100%', maxWidth: 1500 }}>
      {content.title === undefined ? null : (
        <div style={{ fontSize: 38, fontWeight: 700, marginBottom: 24 }}>
          {content.title}
        </div>
      )}
      <div
        style={{
          backgroundColor: style.surface,
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: style.radiusPx,
          overflow: 'hidden',
          padding: '30px 0',
        }}
      >
        {content.code.split('\n').map((line, index) => {
          const lineNumber = index + 1
          return (
            <div
              key={lineNumber}
              style={{
                display: 'flex',
                backgroundColor: highlighted.has(lineNumber)
                  ? style.accentSoft
                  : 'transparent',
                borderLeft: highlighted.has(lineNumber)
                  ? `4px solid ${style.accent}`
                  : '4px solid transparent',
                padding: '6px 34px',
                fontFamily: style.monoFontFamily,
                fontSize: 28,
                lineHeight: 1.45,
              }}
            >
              <span
                style={{
                  color: style.muted,
                  width: 58,
                  userSelect: 'none',
                }}
              >
                {lineNumber}
              </span>
              <span style={{ whiteSpace: 'pre' }}>{line || ' '}</span>
            </div>
          )
        })}
      </div>
      {content.annotation === undefined ? null : (
        <div
          style={{
            color: style.accent,
            fontSize: 28,
            fontWeight: 650,
            marginTop: 24,
          }}
        >
          {content.annotation}
        </div>
      )}
    </div>
  )
}

function DiagramScene({
  content,
  style,
}: {
  content: DiagramSceneContent
  style: VideoStyle
}) {
  const width = 1400
  const height = 650
  const nodes = new Map(content.nodes.map((node) => [node.id, node]))

  return (
    <div style={{ width: '100%', maxWidth: 1500 }}>
      {content.title === undefined ? null : (
        <div style={{ fontSize: 42, fontWeight: 720, marginBottom: 24 }}>
          {content.title}
        </div>
      )}
      <svg width="100%" viewBox={`0 0 ${width} ${height}`}>
        <defs>
          <marker
            id="videooo-arrow"
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="7"
            markerHeight="7"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill={style.muted} />
          </marker>
        </defs>

        {content.edges.map((edge, index) => {
          const from = nodes.get(edge.from)!
          const to = nodes.get(edge.to)!
          const x1 = from.x * width
          const y1 = from.y * height
          const x2 = to.x * width
          const y2 = to.y * height
          return (
            <g key={`${edge.from}-${edge.to}-${index}`}>
              <line
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke={style.muted}
                strokeWidth={4}
                markerEnd="url(#videooo-arrow)"
              />
              {edge.label === undefined ? null : (
                <text
                  x={(x1 + x2) / 2}
                  y={(y1 + y2) / 2 - 12}
                  textAnchor="middle"
                  fill={style.muted}
                  fontSize={24}
                  fontFamily={style.fontFamily}
                >
                  {edge.label}
                </text>
              )}
            </g>
          )
        })}

        {content.nodes.map((node) => {
          const x = node.x * width
          const y = node.y * height
          return (
            <g key={node.id}>
              <rect
                x={x - 110}
                y={y - 48}
                width={220}
                height={96}
                rx={24}
                fill={node.emphasis ? style.accentSoft : style.surface}
                stroke={node.emphasis ? style.accent : 'rgba(255,255,255,0.12)'}
                strokeWidth={node.emphasis ? 4 : 2}
              />
              <text
                x={x}
                y={y + 9}
                textAnchor="middle"
                fill={node.emphasis ? style.accent : style.foreground}
                fontSize={27}
                fontWeight={650}
                fontFamily={style.fontFamily}
              >
                {node.label}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

function SummaryScene({
  content,
  style,
}: {
  content: SummarySceneContent
  style: VideoStyle
}) {
  return (
    <div style={{ width: '100%', maxWidth: 1450 }}>
      <div
        style={{
          color: style.accent,
          fontSize: 34,
          fontWeight: 720,
          marginBottom: 28,
        }}
      >
        {content.title}
      </div>
      <div style={{ display: 'grid', gap: 20 }}>
        {content.bullets.map((bullet, index) => (
          <div
            key={bullet}
            style={{
              alignItems: 'center',
              backgroundColor: style.surface,
              borderRadius: style.radiusPx,
              display: 'flex',
              fontSize: 38,
              gap: 24,
              lineHeight: 1.3,
              padding: '24px 30px',
            }}
          >
            <div
              style={{
                alignItems: 'center',
                backgroundColor: style.accentSoft,
                borderRadius: 999,
                color: style.accent,
                display: 'flex',
                flex: '0 0 auto',
                fontSize: 24,
                fontWeight: 750,
                height: 48,
                justifyContent: 'center',
                width: 48,
              }}
            >
              {index + 1}
            </div>
            {bullet}
          </div>
        ))}
      </div>
    </div>
  )
}

function sceneMotion(
  scene: SceneIR,
  frame: number,
  durationInFrames: number,
): { opacity: number; translateY: number } {
  if (scene.transition === 'cut') {
    return { opacity: 1, translateY: 0 }
  }

  const entrance = Math.max(1, Math.min(12, Math.floor(durationInFrames / 4)))
  const exitStart = Math.max(entrance + 1, durationInFrames - entrance)
  const opacity = interpolate(
    frame,
    [0, entrance, exitStart, durationInFrames],
    [0, 1, 1, scene.transition === 'fade' ? 0 : 1],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  )

  const translateY =
    scene.transition === 'slide'
      ? interpolate(frame, [0, entrance], [36, 0], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        })
      : 0

  return { opacity, translateY }
}
