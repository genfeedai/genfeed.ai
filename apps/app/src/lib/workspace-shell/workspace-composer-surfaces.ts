/**
 * Surfaces that ship their own primary input: Studio's generation prompt bar,
 * the post/newsletter composers, the document editor toolbar, the messages
 * reply box.
 *
 * The shell's floating composer stands down on those canvas surfaces. Stacking
 * it under Studio's own bar produced two prompt bars on one screen carrying the
 * same suggestion chips — the surface's input duplicated, not a second
 * affordance. The routed agent-conversation surface is not in this set because
 * its shell composer is the primary input.
 */
export const WORKSPACE_SURFACES_WITH_OWN_PRIMARY_INPUT: ReadonlySet<string> =
  new Set([
    'compose',
    'editor',
    'messages',
    'post-composer',
    'studio',
    'studio-specialized',
  ]);

export function surfaceOwnsPrimaryInput(surfaceKey: string): boolean {
  return WORKSPACE_SURFACES_WITH_OWN_PRIMARY_INPUT.has(surfaceKey);
}
