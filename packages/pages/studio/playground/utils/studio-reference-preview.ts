import type { PromptBarAttachedAsset } from '@genfeedai/props/studio/prompt-bar.props';
import type { StudioPlaygroundType } from '@pages/studio/playground/types';

const PREVIEW_ROLE_ORDER: Partial<
  Record<StudioPlaygroundType, readonly PromptBarAttachedAsset['role'][]>
> = {
  image: ['reference', 'input', 'startFrame', 'editSource'],
  'image-edit': ['editSource'],
  video: ['startFrame', 'endFrame', 'reference'],
};

/**
 * A composer preview the card can paint. Remote URLs survive a reload; a
 * blob or data URL only lasts for this document.
 */
export function readStudioReferencePreviewUrl(
  value: unknown,
): string | undefined {
  if (typeof value !== 'string') return undefined;
  const preview = value.trim();
  if (!preview) return undefined;
  if (preview.startsWith('blob:') || preview.startsWith('data:image/')) {
    return preview;
  }
  try {
    const url = new URL(preview);
    return url.protocol === 'https:' || url.protocol === 'http:'
      ? preview
      : undefined;
  } catch {
    return undefined;
  }
}

/** Session storage keeps only URLs that still resolve after a reload. */
export function readPersistedStudioReferencePreviewUrl(
  value: unknown,
): string | undefined {
  const preview = readStudioReferencePreviewUrl(value);
  if (!preview || preview.startsWith('blob:') || preview.startsWith('data:')) {
    return undefined;
  }
  return preview;
}

export function resolveStudioReferencePreviewUrl(input: {
  assets: readonly Pick<
    PromptBarAttachedAsset,
    'isPrimary' | 'kind' | 'previewUrl' | 'role'
  >[];
  avatarPreview?: string | null;
  type: StudioPlaygroundType;
}): string | undefined {
  if (input.type === 'avatar') {
    return readStudioReferencePreviewUrl(input.avatarPreview);
  }

  const roles = PREVIEW_ROLE_ORDER[input.type];
  if (!roles) return undefined;

  const images = input.assets.filter(
    (asset) =>
      asset.kind === 'image' &&
      asset.role !== 'editMask' &&
      readStudioReferencePreviewUrl(asset.previewUrl),
  );
  for (const role of roles) {
    const matches = images.filter((asset) => asset.role === role);
    const chosen = matches.find((asset) => asset.isPrimary) ?? matches[0];
    const preview = readStudioReferencePreviewUrl(chosen?.previewUrl);
    if (preview) return preview;
  }
  return undefined;
}
