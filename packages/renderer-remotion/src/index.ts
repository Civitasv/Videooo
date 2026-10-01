import type { RendererAdapter, SceneIR } from '@videooo/domain'

export const remotionRenderer: RendererAdapter = {
  kind: 'remotion',
  supports(scene: SceneIR): boolean {
    return scene.renderer === 'remotion'
  },
}
