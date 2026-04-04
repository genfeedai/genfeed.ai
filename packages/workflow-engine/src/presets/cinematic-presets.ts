export interface CinematicPreset {
  id: string;
  name: string;
  description: string;
  cameraPrompt: string; // Injected into video gen prompt
  colorGrade: {
    cameraProfile: string;
    contrast: number;
    saturation: number;
    temperature: number;
    shadows: number;
    midtones: number;
    highlights: number;
  };
  filmGrain: {
    stock: string;
    intensity: number;
    size: string;
    colorGrain: boolean;
  };
  lensEffects: {
    vignette: { enabled: boolean; intensity: number; softness: number };
    chromaticAberration: { enabled: boolean; intensity: number };
    barrelDistortion: { enabled: boolean; amount: number };
    bloom: { enabled: boolean; threshold: number; intensity: number };
  };
}

export const CINEMATIC_PRESETS: Record<string, CinematicPreset> = {
  commercial_clean: {
    cameraPrompt:
      'Sony Venice 2 with Sony CineAlta 50mm T2.0, pristine detail, balanced color science, soft diffusion, studio lighting',
    colorGrade: {
      cameraProfile: 'Sony S-Log3',
      contrast: 1.08,
      highlights: 0,
      midtones: 0,
      saturation: 1.0,
      shadows: 0,
      temperature: 5500,
    },
    description:
      'Pristine, polished commercial look with balanced color and soft diffusion',
    filmGrain: {
      colorGrain: false,
      intensity: 0.0,
      size: 'fine',
      stock: 'Digital Clean',
    },
    id: 'commercial_clean',
    lensEffects: {
      barrelDistortion: { amount: 0, enabled: false },
      bloom: { enabled: true, intensity: 0.2, threshold: 0.95 },
      chromaticAberration: { enabled: false, intensity: 0 },
      vignette: { enabled: true, intensity: 0.15, softness: 0.9 },
    },
    name: 'Commercial Clean',
  },
  documentary_raw: {
    cameraPrompt:
      'Filmed on RED V-Raptor XL with Zeiss Supreme Prime 35mm, handheld stabilized, natural lighting, high detail retention in shadows',
    colorGrade: {
      cameraProfile: 'RED Log3G10',
      contrast: 1.05,
      highlights: -10,
      midtones: -5,
      saturation: 0.85,
      shadows: 10,
      temperature: 5800,
    },
    description:
      'Authentic documentary style with RED camera, high detail and natural lighting',
    filmGrain: {
      colorGrain: false,
      intensity: 0.05,
      size: 'medium',
      stock: 'Digital Clean',
    },
    id: 'documentary_raw',
    lensEffects: {
      barrelDistortion: { amount: 0.05, enabled: true },
      bloom: { enabled: false, intensity: 0, threshold: 0 },
      chromaticAberration: { enabled: true, intensity: 0.1 },
      vignette: { enabled: false, intensity: 0, softness: 0 },
    },
    name: 'Documentary Raw',
  },
  hollywood_blockbuster: {
    cameraPrompt:
      'Shot on ARRI Alexa Mini LF with Cooke S7/i 50mm T2.0, shallow depth of field, natural skin tones, wide dynamic range, subtle film grain',
    colorGrade: {
      cameraProfile: 'ARRI LogC3',
      contrast: 1.15,
      highlights: 5,
      midtones: 0,
      saturation: 0.95,
      shadows: -5,
      temperature: 5600,
    },
    description:
      'Premium cinematic look with ARRI Alexa, perfect for high-end commercial content',
    filmGrain: {
      colorGrain: false,
      intensity: 0.15,
      size: 'fine',
      stock: 'Kodak Vision3 250D',
    },
    id: 'hollywood_blockbuster',
    lensEffects: {
      barrelDistortion: { amount: 0, enabled: false },
      bloom: { enabled: true, intensity: 0.3, threshold: 0.9 },
      chromaticAberration: { enabled: false, intensity: 0 },
      vignette: { enabled: true, intensity: 0.2, softness: 0.7 },
    },
    name: 'Hollywood Blockbuster',
  },
  indie_film: {
    cameraPrompt:
      'Shot on Blackmagic Pocket 6K Pro with Rokinon 24mm T1.5, anamorphic lens flare, desaturated color palette, visible film grain, moody atmosphere',
    colorGrade: {
      cameraProfile: 'BMD Film Gen 5',
      contrast: 1.1,
      highlights: -5,
      midtones: -10,
      saturation: 0.75,
      shadows: 15,
      temperature: 4800,
    },
    description:
      'Moody, atmospheric indie aesthetic with anamorphic characteristics',
    filmGrain: {
      colorGrain: true,
      intensity: 0.35,
      size: 'medium',
      stock: 'Kodak Vision3 500T',
    },
    id: 'indie_film',
    lensEffects: {
      barrelDistortion: { amount: 0.08, enabled: true },
      bloom: { enabled: true, intensity: 0.5, threshold: 0.75 },
      chromaticAberration: { enabled: true, intensity: 0.25 },
      vignette: { enabled: true, intensity: 0.45, softness: 0.6 },
    },
    name: 'Indie Film',
  },
  social_media_cinematic: {
    cameraPrompt:
      'Canon C70 with Sigma 18-35mm f/1.8 Art lens, vibrant colors, punchy contrast, smooth bokeh in background',
    colorGrade: {
      cameraProfile: 'Canon C-Log2',
      contrast: 1.25,
      highlights: 10,
      midtones: 5,
      saturation: 1.15,
      shadows: -15,
      temperature: 5200,
    },
    description:
      'Punchy, vibrant look optimized for Instagram and TikTok engagement',
    filmGrain: {
      colorGrain: true,
      intensity: 0.08,
      size: 'fine',
      stock: 'Digital Clean',
    },
    id: 'social_media_cinematic',
    lensEffects: {
      barrelDistortion: { amount: 0, enabled: false },
      bloom: { enabled: true, intensity: 0.4, threshold: 0.85 },
      chromaticAberration: { enabled: false, intensity: 0 },
      vignette: { enabled: true, intensity: 0.35, softness: 0.5 },
    },
    name: 'Social Media Cinematic',
  },
  vintage_35mm: {
    cameraPrompt:
      'Filmed on 35mm Kodak Vision3 500T film stock, Panavision Primo 40mm lens, heavy grain structure, warm color shift, lifted blacks, halation on highlights',
    colorGrade: {
      cameraProfile: 'Film Print Emulation',
      contrast: 0.95,
      highlights: 15,
      midtones: 10,
      saturation: 1.05,
      shadows: 25,
      temperature: 4500,
    },
    description:
      'Classic film stock emulation with heavy grain and warm color shift',
    filmGrain: {
      colorGrain: true,
      intensity: 0.55,
      size: 'large',
      stock: 'Kodak Vision3 500T',
    },
    id: 'vintage_35mm',
    lensEffects: {
      barrelDistortion: { amount: 0.12, enabled: true },
      bloom: { enabled: true, intensity: 0.6, threshold: 0.7 },
      chromaticAberration: { enabled: true, intensity: 0.15 },
      vignette: { enabled: true, intensity: 0.3, softness: 0.8 },
    },
    name: 'Vintage 35mm Film',
  },
};

export const getPresetById = (id: string): CinematicPreset | null => {
  return CINEMATIC_PRESETS[id] || null;
};

export const getAllPresets = (): CinematicPreset[] => {
  return Object.values(CINEMATIC_PRESETS);
};

export const getPresetsByCategory = (
  category: 'professional' | 'social' | 'artistic',
): CinematicPreset[] => {
  const categoryMap: Record<string, string[]> = {
    artistic: ['indie_film', 'vintage_35mm'],
    professional: [
      'hollywood_blockbuster',
      'documentary_raw',
      'commercial_clean',
    ],
    social: ['social_media_cinematic'],
  };

  const presetIds = categoryMap[category] || [];
  return presetIds
    .map((id) => CINEMATIC_PRESETS[id])
    .filter((preset): preset is CinematicPreset => preset !== undefined);
};
