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
