import type { GenerationSetupLookPreviewKind } from '@genfeedai/props/ui/generation-setup/generation-setup.props';

/** Illustrations are contact sheets in `public/assets/look-previews`; a key's index is its tile. */
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

export const GENERATION_SETUP_SCENE_PREVIEW_KEYS = [
  'studio',
  'indoor',
  'cozy-interior',
  'outdoor',
  'urban-street',
  'city-skyline',
  'nature',
  'forest',
  'beach',
  'desert',
  'underwater',
  'space',
  'industrial',
  'abstract',
] as const;

export const GENERATION_SETUP_CAMERA_PREVIEW_KEYS = [
  'eye-level',
  'close-up',
  'wide-angle',
  'establishing',
  'portrait',
  'macro',
  'telephoto',
  'low-angle',
  'high-angle',
  'dutch-angle',
  'drone',
  'tilt-shift',
  'fisheye',
] as const;

export const GENERATION_SETUP_LENS_PREVIEW_KEYS = [
  '35mm',
  '50mm',
  '85mm-portrait',
  '24mm-wide',
  '14mm-ultra-wide',
  '135mm-telephoto',
  '100mm-macro',
  'anamorphic',
  'vintage-prime',
  'fisheye',
  'tilt-shift',
] as const;

export const GENERATION_SETUP_LIGHTING_PREVIEW_KEYS = [
  'natural',
  'golden-hour',
  'studio',
  'soft',
  'dramatic',
  'cinematic',
  'neon',
  'backlit',
  'rim-light',
  'high-key',
  'low-key',
  'candlelight',
  'moonlight',
  'fluorescent',
] as const;

export const GENERATION_SETUP_CAMERA_MOVEMENT_PREVIEW_KEYS = [
  'static',
  'pan-left',
  'pan-right',
  'tilt-up',
  'tilt-down',
  'dolly-in',
  'dolly-out',
  'tracking',
  'orbit',
  'crane-up',
  'handheld',
  'zoom-in',
  'zoom-out',
  'drone-flyover',
  'whip-pan',
] as const;

/** One tile of a contact sheet: which sheet, and where on its grid. */
export interface GenerationSetupLookPreviewTile {
  atlasUrl: string;
  column: number;
  columns: number;
  row: number;
  rows: number;
}

const STYLE_MOOD_KEYS: Record<'mood' | 'style', readonly string[]> = {
  mood: GENERATION_SETUP_MOOD_PREVIEW_KEYS,
  style: GENERATION_SETUP_STYLE_PREVIEW_KEYS,
};

const SHEET_COLUMNS = 4;

const SHEETS: Record<
  Exclude<GenerationSetupLookPreviewKind, 'mood' | 'style'>,
  { atlasUrl: string; keys: readonly string[] }
> = {
  camera: {
    atlasUrl: '/assets/look-previews/camera-atlas.png',
    keys: GENERATION_SETUP_CAMERA_PREVIEW_KEYS,
  },
  cameraMovement: {
    atlasUrl: '/assets/look-previews/movement-atlas.png',
    keys: GENERATION_SETUP_CAMERA_MOVEMENT_PREVIEW_KEYS,
  },
  lens: {
    atlasUrl: '/assets/look-previews/lens-atlas.png',
    keys: GENERATION_SETUP_LENS_PREVIEW_KEYS,
  },
  lighting: {
    atlasUrl: '/assets/look-previews/lighting-atlas.png',
    keys: GENERATION_SETUP_LIGHTING_PREVIEW_KEYS,
  },
  scene: {
    atlasUrl: '/assets/look-previews/scene-atlas.png',
    keys: GENERATION_SETUP_SCENE_PREVIEW_KEYS,
  },
};

export function getGenerationSetupLookPreviewTile(
  kind: GenerationSetupLookPreviewKind | undefined,
  value: string,
  isPlatformDefault?: boolean,
): GenerationSetupLookPreviewTile | undefined {
  if (!kind || !isPlatformDefault) return undefined;
  if (kind === 'style' || kind === 'mood') {
    const index = STYLE_MOOD_KEYS[kind].indexOf(value);
    if (index < 0) return undefined;
    const tile =
      kind === 'style'
        ? index
        : GENERATION_SETUP_STYLE_PREVIEW_KEYS.length + index;
    return {
      atlasUrl: GENERATION_SETUP_LOOK_PREVIEW_ATLAS,
      column: tile % SHEET_COLUMNS,
      columns: SHEET_COLUMNS,
      row: Math.floor(tile / SHEET_COLUMNS),
      rows: 8,
    };
  }
  const sheet = SHEETS[kind];
  const index = sheet.keys.indexOf(value);
  if (index < 0) return undefined;
  return {
    atlasUrl: sheet.atlasUrl,
    column: index % SHEET_COLUMNS,
    columns: SHEET_COLUMNS,
    row: Math.floor(index / SHEET_COLUMNS),
    rows: SHEET_COLUMNS,
  };
}
