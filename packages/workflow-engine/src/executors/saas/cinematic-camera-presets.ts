import type { CinematicColorGradeConfig } from '@workflow-engine/executors/saas/cinematic-color-grade-executor';
import type { FilmGrainConfig } from '@workflow-engine/executors/saas/film-grain-executor';
import type { LensEffectsConfig } from '@workflow-engine/executors/saas/lens-effects-executor';

export interface CinematicCameraPreset {
  id: string;
  name: string;
  camera: string;
  description: string;
  promptFragment: string;
  colorGrade: CinematicColorGradeConfig;
  filmGrain: FilmGrainConfig;
  lensEffects: LensEffectsConfig;
}

const off = { enabled: false } as const;

export const CINEMATIC_CAMERA_PRESETS: Record<string, CinematicCameraPreset> = {
  // -------------------------------------------------------------------------
  // 6. Commercial Clean — Sony Venice 2
  // -------------------------------------------------------------------------
  commercial_clean: {
    camera: 'Sony Venice 2',
    colorGrade: {
      cameraProfile: 'sony_slog3',
      contrast: 5,
      highlights: 0,
      lutIntensity: 0,
      midtones: 5,
      saturation: 5,
      shadows: 0,
      temperature: 6500,
    },
    description:
      'Clean, polished look with accurate colors and minimal grain. Broadcast and commercial ready.',
    filmGrain: {
      animateGrain: false,
      colorGrain: false,
      intensity: 8,
      size: 'fine',
      stock: 'digital_noise',
    },
    id: 'commercial_clean',
    lensEffects: {
      barrelDistortion: { ...off, amount: 0 },
      bloom: { enabled: true, intensity: 10, threshold: 90 },
      chromaticAberration: { ...off, intensity: 0 },
      vignette: { enabled: true, intensity: 8, softness: 90 },
    },
    name: 'Commercial Clean',
    promptFragment:
      'shot on Sony Venice 2, clean cinematic look, accurate colors, soft lighting, polished, commercial',
  },

  // -------------------------------------------------------------------------
  // 2. Documentary Raw — RED V-Raptor XL
  // -------------------------------------------------------------------------
  documentary_raw: {
    camera: 'RED V-Raptor XL',
    colorGrade: {
      cameraProfile: 'red_ippc2',
      contrast: 25,
      highlights: -5,
      lutIntensity: 0,
      midtones: 0,
      saturation: -20,
      shadows: -10,
      temperature: 6200,
    },
    description:
      'High-contrast, desaturated look with sharp detail. Raw and authentic feel.',
    filmGrain: {
      animateGrain: true,
      colorGrain: true,
      intensity: 35,
      size: 'medium',
      stock: '35mm_heavy',
    },
    id: 'documentary_raw',
    lensEffects: {
      barrelDistortion: { amount: 10, enabled: true },
      bloom: { ...off, intensity: 0, threshold: 80 },
      chromaticAberration: { ...off, intensity: 0 },
      vignette: { enabled: true, intensity: 15, softness: 50 },
    },
    name: 'Documentary Raw',
    promptFragment:
      'shot on RED V-Raptor XL, handheld, natural lighting, documentary style, 8K downscaled',
  },
  // -------------------------------------------------------------------------
  // 1. Hollywood Blockbuster — ARRI Alexa Mini LF
  // -------------------------------------------------------------------------
  hollywood_blockbuster: {
    camera: 'ARRI Alexa Mini LF',
    colorGrade: {
      cameraProfile: 'arri_logc4',
      contrast: 15,
      highlights: 10,
      lutIntensity: 0,
      midtones: 5,
      saturation: -10,
      shadows: -15,
      temperature: 5800,
    },
    description:
      'Rich cinematic look with deep shadows and warm highlights. The gold standard for feature films.',
    filmGrain: {
      animateGrain: true,
      colorGrain: false,
      intensity: 25,
      size: 'fine',
      stock: '35mm_fine',
    },
    id: 'hollywood_blockbuster',
    lensEffects: {
      barrelDistortion: { amount: 0, enabled: false },
      bloom: { enabled: true, intensity: 15, threshold: 85 },
      chromaticAberration: { enabled: true, intensity: 8 },
      vignette: { enabled: true, intensity: 30, softness: 70 },
    },
    name: 'Hollywood Blockbuster',
    promptFragment:
      'shot on ARRI Alexa Mini LF, anamorphic lens, cinematic lighting, film grain, shallow depth of field',
  },

  // -------------------------------------------------------------------------
  // 4. Indie Film — Blackmagic Pocket 6K Pro
  // -------------------------------------------------------------------------
  indie_film: {
    camera: 'Blackmagic Pocket 6K Pro',
    colorGrade: {
      cameraProfile: 'bmpcc_film',
      contrast: 30,
      highlights: -10,
      lutIntensity: 0,
      midtones: -5,
      saturation: -15,
      shadows: -25,
      temperature: 5500,
    },
    description:
      'Gritty, textured look with crushed blacks and muted tones. Festival-ready aesthetic.',
    filmGrain: {
      animateGrain: true,
      colorGrain: true,
      intensity: 45,
      size: 'medium',
      stock: '16mm',
    },
    id: 'indie_film',
    lensEffects: {
      barrelDistortion: { amount: 8, enabled: true },
      bloom: { ...off, intensity: 0, threshold: 80 },
      chromaticAberration: { enabled: true, intensity: 15 },
      vignette: { enabled: true, intensity: 40, softness: 50 },
    },
    name: 'Indie Film',
    promptFragment:
      'shot on Blackmagic Pocket 6K Pro, indie film look, moody lighting, crushed blacks, textured',
  },

  // -------------------------------------------------------------------------
  // 3. Social Media Cinematic — Canon C70
  // -------------------------------------------------------------------------
  social_media_cinematic: {
    camera: 'Canon C70',
    colorGrade: {
      cameraProfile: 'canon_clog3',
      contrast: 10,
      highlights: 5,
      lutIntensity: 0,
      midtones: 10,
      saturation: 20,
      shadows: 5,
      temperature: 6800,
    },
    description:
      'Vibrant, punchy colors optimized for mobile screens. Bright and engaging.',
    filmGrain: {
      animateGrain: true,
      colorGrain: false,
      intensity: 10,
      size: 'fine',
      stock: '35mm_fine',
    },
    id: 'social_media_cinematic',
    lensEffects: {
      barrelDistortion: { ...off, amount: 0 },
      bloom: { enabled: true, intensity: 20, threshold: 75 },
      chromaticAberration: { ...off, intensity: 0 },
      vignette: { enabled: true, intensity: 10, softness: 80 },
    },
    name: 'Social Media Cinematic',
    promptFragment:
      'shot on Canon C70, vibrant colors, soft lighting, social media ready, vertical format',
  },

  // -------------------------------------------------------------------------
  // 5. Vintage 35mm — Kodak Vision3 500T
  // -------------------------------------------------------------------------
  vintage_35mm: {
    camera: 'Kodak Vision3 500T',
    colorGrade: {
      cameraProfile: 'kodak_500t',
      contrast: 20,
      highlights: 15,
      lutIntensity: 0,
      midtones: 10,
      saturation: -5,
      shadows: -10,
      temperature: 4800,
    },
    description:
      'Warm, nostalgic film look with heavy grain and halation. Classic celluloid aesthetic.',
    filmGrain: {
      animateGrain: true,
      colorGrain: true,
      intensity: 60,
      size: 'coarse',
      stock: '35mm_heavy',
    },
    id: 'vintage_35mm',
    lensEffects: {
      barrelDistortion: { ...off, amount: 0 },
      bloom: { enabled: true, intensity: 35, threshold: 70 },
      chromaticAberration: { enabled: true, intensity: 20 },
      vignette: { enabled: true, intensity: 35, softness: 60 },
    },
    name: 'Vintage 35mm',
    promptFragment:
      'shot on Kodak Vision3 500T film stock, 35mm, warm tones, heavy grain, halation, nostalgic',
  },
};

/**
 * Get a camera preset by id.
 */
export function getCinematicCameraPreset(
  id: string,
): CinematicCameraPreset | undefined {
  return CINEMATIC_CAMERA_PRESETS[id];
}

/**
 * List all available camera preset ids.
 */
export function listCinematicCameraPresetIds(): string[] {
  return Object.keys(CINEMATIC_CAMERA_PRESETS);
}
