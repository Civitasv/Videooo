import type { RendererAdapter, SceneIR } from '@videooo/domain'

export const manimRenderer: RendererAdapter = {
  kind: 'manim',
  supports(scene: SceneIR): boolean {
    return scene.renderer === 'manim'
  },
}
