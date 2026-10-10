export const GENERATION_SETUP_LOOK_PREVIEW_ATLAS =
  '/assets/look-previews/preview-atlas.png';

export const GENERATION_SETUP_STYLE_PREVIEW_KEYS = [
  'photoreal',
  'cinematic',
  '3d-animated',
  'anime',
  'comic',
  'pixel-art',
  'oil-painting',
  'watercolor',
  'cyberpunk',
  'fantasy',
  'sketch',
  'minimalist',
  'vintage',
  'digital-art',
  'noir',
] as const;

export const GENERATION_SETUP_MOOD_PREVIEW_KEYS = [
  'dreamy',
  'gritty',
  'ethereal',
  'nostalgic',
  'futuristic',
  'mysterious',
  'peaceful',
  'energetic',
  'moody',
  'dramatic',
  'whimsical',
  'tense',
  'joyful',
  'epic',
] as const;

export function getGenerationSetupLookPreviewTile(
  kind: 'style' | 'mood' | undefined,
  value: string,
  isPlatformDefault?: boolean,
): number | undefined {
  if (!kind || !isPlatformDefault) return undefined;
  const keys: readonly string[] =
    kind === 'style'
      ? GENERATION_SETUP_STYLE_PREVIEW_KEYS
      : GENERATION_SETUP_MOOD_PREVIEW_KEYS;
  const index = keys.indexOf(value);
  if (index < 0) return undefined;
  return kind === 'style'
    ? index
    : GENERATION_SETUP_STYLE_PREVIEW_KEYS.length + index;
}
