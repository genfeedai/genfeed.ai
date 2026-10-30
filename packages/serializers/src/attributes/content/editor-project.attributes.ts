import { createEntityAttributes } from '@genfeedai/helpers';

/**
 * A project generated from an approved composition template carries its
 * provenance under `config.composition`, and the update endpoint refuses to
 * change it. Derived on read so the Editor can open it read-only instead of
 * letting every save fail with a 409.
 */
export function computeEditorProjectIsLocked(
  record: Record<string, unknown>,
): boolean {
  const config = record.config;
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    return false;
  }

  return Boolean((config as Record<string, unknown>).composition);
}

/**
 * A finished render is stored as `renderedVideoId`; the contract exposes it
 * as `renderedVideo` (an ingredient or its id). Derived on read so API
 * clients, MCP included, can find the exported video.
 */
export function computeEditorProjectRenderedVideo(
  record: Record<string, unknown>,
): unknown {
  return record.renderedVideo ?? record.renderedVideoId ?? undefined;
}

export const editorProjectAttributes = createEntityAttributes([
  'name',
  'organization',
  'brand',
  'user',
  'tracks',
  'settings',
  'totalDurationFrames',
  'status',
  'isLocked',
  'renderedVideo',
  'thumbnailUrl',
]);
