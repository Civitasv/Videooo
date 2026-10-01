import type { RendererAdapter } from '@videooo/domain'

export const manimRenderer: RendererAdapter = {
  kind: 'manim',
  supports(): boolean {
    return false
  },
}
