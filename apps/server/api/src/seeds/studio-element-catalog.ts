import { createHash } from 'node:crypto';

export type StudioElementTable =
  | 'elements_styles'
  | 'elements_moods'
  | 'elements_scenes'
  | 'elements_cameras'
  | 'elements_lenses'
  | 'elements_lightings'
  | 'elements_camera_movements'
  | 'elements_sounds';

export type StudioElementModel =
  | 'elementStyle'
  | 'elementMood'
  | 'elementScene'
  | 'elementCamera'
  | 'elementLens'
  | 'elementLighting'
  | 'elementCameraMovement'
  | 'elementSound';

export type StudioElementEntry = {
  description: string;
  key: string;
  label: string;
  sortOrder: number;
};

export type StudioElementDomain = {
  entries: readonly StudioElementEntry[];
  model: StudioElementModel;
  table: StudioElementTable;
};

export const STUDIO_ELEMENT_CATALOG: readonly StudioElementDomain[] = [
  {
    table: 'elements_styles',
    model: 'elementStyle',
    entries: [
      {
        key: 'photoreal',
        label: 'Photoreal',
        description:
          'Lifelike photography with natural textures, light and depth.',
        sortOrder: 0,
      },
      {
        key: 'cinematic',
        label: 'Cinematic',
        description: 'Film-grade framing, color grading and dramatic lighting.',
        sortOrder: 10,
      },
      {
        key: '3d-animated',
        label: '3D Animated',
        description:
          'Polished 3D animation with stylized characters and soft global lighting.',
        sortOrder: 20,
      },
      {
        key: 'anime',
        label: 'Anime',
        description:
          'Japanese animation look with clean linework and expressive color.',
        sortOrder: 30,
      },
      {
        key: 'comic',
        label: 'Comic',
        description:
          'Comic-book panels with bold inks, halftones and punchy color.',
        sortOrder: 40,
      },
      {
        key: 'pixel-art',
        label: 'Pixel Art',
        description:
          'Retro low-resolution pixel graphics with a limited palette.',
        sortOrder: 50,
      },
      {
        key: 'oil-painting',
        label: 'Oil Painting',
        description:
          'Rich brushstrokes and layered pigment like a classical oil canvas.',
        sortOrder: 60,
      },
      {
        key: 'watercolor',
        label: 'Watercolor',
        description:
          'Soft translucent washes with bleeding edges on textured paper.',
        sortOrder: 70,
      },
      {
        key: 'cyberpunk',
        label: 'Cyberpunk',
        description:
          'Neon-soaked futuristic cityscapes with high-tech, low-life grit.',
        sortOrder: 80,
      },
      {
        key: 'fantasy',
        label: 'Fantasy',
        description:
          'Epic, magical worlds with painterly detail and mythic atmosphere.',
        sortOrder: 90,
      },
      {
        key: 'sketch',
        label: 'Sketch',
        description:
          'Hand-drawn pencil or ink sketch with visible construction lines.',
        sortOrder: 100,
      },
      {
        key: 'minimalist',
        label: 'Minimalist',
        description:
          'Clean composition, simple shapes and generous negative space.',
        sortOrder: 110,
      },
      {
        key: 'vintage',
        label: 'Vintage',
        description:
          'Faded film tones, grain and the look of mid-century photographs.',
        sortOrder: 120,
      },
      {
        key: 'digital-art',
        label: 'Digital Art',
        description:
          'Crisp digital illustration with vivid color and polished rendering.',
        sortOrder: 130,
      },
      {
        key: 'noir',
        label: 'Noir',
        description:
          'High-contrast black and white with deep shadows and moody tension.',
        sortOrder: 140,
      },
    ],
  },
  {
    table: 'elements_moods',
    model: 'elementMood',
    entries: [
      {
        key: 'dreamy',
        label: 'Dreamy',
        description:
          'Soft, floating and surreal, like a half-remembered dream.',
        sortOrder: 0,
      },
      {
        key: 'gritty',
        label: 'Gritty',
        description: 'Raw, rough and unpolished with a hard edge.',
        sortOrder: 10,
      },
      {
        key: 'ethereal',
        label: 'Ethereal',
        description: 'Delicate, glowing and otherworldly.',
        sortOrder: 20,
      },
      {
        key: 'nostalgic',
        label: 'Nostalgic',
        description: 'Warm and wistful, evoking the past.',
        sortOrder: 30,
      },
      {
        key: 'futuristic',
        label: 'Futuristic',
        description: 'Sleek, technological and forward-looking.',
        sortOrder: 40,
      },
      {
        key: 'mysterious',
        label: 'Mysterious',
        description: 'Shadowy and intriguing, hiding more than it shows.',
        sortOrder: 50,
      },
      {
        key: 'peaceful',
        label: 'Peaceful',
        description: 'Calm, quiet and unhurried.',
        sortOrder: 60,
      },
      {
        key: 'energetic',
        label: 'Energetic',
        description: 'Fast, vibrant and full of motion.',
        sortOrder: 70,
      },
      {
        key: 'moody',
        label: 'Moody',
        description: 'Brooding and atmospheric with deep emotion.',
        sortOrder: 80,
      },
      {
        key: 'dramatic',
        label: 'Dramatic',
        description: 'Heightened emotion and strong contrast.',
        sortOrder: 90,
      },
      {
        key: 'whimsical',
        label: 'Whimsical',
        description: 'Playful, quirky and lighthearted.',
        sortOrder: 100,
      },
      {
        key: 'tense',
        label: 'Tense',
        description: 'Uneasy and suspenseful with building pressure.',
        sortOrder: 110,
      },
      {
        key: 'joyful',
        label: 'Joyful',
        description: 'Bright, happy and celebratory.',
        sortOrder: 120,
      },
      {
        key: 'epic',
        label: 'Epic',
        description: 'Grand in scale, heroic and awe-inspiring.',
        sortOrder: 130,
      },
    ],
  },
  {
    table: 'elements_scenes',
    model: 'elementScene',
    entries: [
      {
        key: 'studio',
        label: 'Studio',
        description: 'Controlled studio set with a clean backdrop.',
        sortOrder: 0,
      },
      {
        key: 'indoor',
        label: 'Indoor',
        description: 'A generic interior space with natural room lighting.',
        sortOrder: 10,
      },
      {
        key: 'cozy-interior',
        label: 'Cozy Interior',
        description: 'A warm, lived-in home interior.',
        sortOrder: 20,
      },
      {
        key: 'outdoor',
        label: 'Outdoor',
        description: 'Open-air setting under natural light.',
        sortOrder: 30,
      },
      {
        key: 'urban-street',
        label: 'Urban Street',
        description: 'City street with buildings, signs and foot traffic.',
        sortOrder: 40,
      },
      {
        key: 'city-skyline',
        label: 'City Skyline',
        description: 'Wide view of a city skyline at a distance.',
        sortOrder: 50,
      },
      {
        key: 'nature',
        label: 'Nature',
        description: 'Unspoiled landscape with plants and open sky.',
        sortOrder: 60,
      },
      {
        key: 'forest',
        label: 'Forest',
        description: 'Dense woodland with dappled light through the trees.',
        sortOrder: 70,
      },
      {
        key: 'beach',
        label: 'Beach',
        description: 'Sandy shoreline with waves and open horizon.',
        sortOrder: 80,
      },
      {
        key: 'desert',
        label: 'Desert',
        description: 'Dry dunes and wide, sun-baked horizons.',
        sortOrder: 90,
      },
      {
        key: 'underwater',
        label: 'Underwater',
        description: 'Submerged scene with light rays and floating particles.',
        sortOrder: 100,
      },
      {
        key: 'space',
        label: 'Space',
        description: 'Deep space, planets and starfields.',
        sortOrder: 110,
      },
      {
        key: 'industrial',
        label: 'Industrial',
        description: 'Factories, warehouses and raw metal.',
        sortOrder: 120,
      },
      {
        key: 'abstract',
        label: 'Abstract',
        description: 'Non-literal shapes, color and texture.',
        sortOrder: 130,
      },
    ],
  },
  {
    table: 'elements_cameras',
    model: 'elementCamera',
    entries: [
      {
        key: 'eye-level',
        label: 'Eye Level',
        description: 'Neutral framing at the subject eye line.',
        sortOrder: 0,
      },
      {
        key: 'close-up',
        label: 'Close-up',
        description: 'Tight framing that fills the frame with the subject.',
        sortOrder: 10,
      },
      {
        key: 'wide-angle',
        label: 'Wide Angle',
        description: 'Expansive framing that captures the whole environment.',
        sortOrder: 20,
      },
      {
        key: 'establishing',
        label: 'Establishing Shot',
        description: 'Wide opening shot that sets location and context.',
        sortOrder: 30,
      },
      {
        key: 'portrait',
        label: 'Portrait',
        description: 'Flattering head-and-shoulders framing.',
        sortOrder: 40,
      },
      {
        key: 'macro',
        label: 'Macro',
        description: 'Extreme close detail on very small subjects.',
        sortOrder: 50,
      },
      {
        key: 'telephoto',
        label: 'Telephoto',
        description: 'Compressed perspective from a long distance.',
        sortOrder: 60,
      },
      {
        key: 'low-angle',
        label: 'Low Angle',
        description: 'Shot from below to make the subject feel powerful.',
        sortOrder: 70,
      },
      {
        key: 'high-angle',
        label: 'High Angle',
        description: 'Shot from above to make the subject feel small.',
        sortOrder: 80,
      },
      {
        key: 'dutch-angle',
        label: 'Dutch Angle',
        description: 'Tilted horizon for unease and energy.',
        sortOrder: 90,
      },
      {
        key: 'drone',
        label: 'Drone',
        description: 'Aerial view from a flying camera.',
        sortOrder: 100,
      },
      {
        key: 'tilt-shift',
        label: 'Tilt-Shift',
        description: 'Selective focus that makes scenes look like miniatures.',
        sortOrder: 110,
      },
      {
        key: 'fisheye',
        label: 'Fisheye',
        description: 'Ultra-wide spherical distortion.',
        sortOrder: 120,
      },
    ],
  },
  {
    table: 'elements_lenses',
    model: 'elementLens',
    entries: [
      {
        key: '35mm',
        label: '35mm',
        description: 'Natural wide-normal view, versatile for storytelling.',
        sortOrder: 0,
      },
      {
        key: '50mm',
        label: '50mm',
        description: 'Classic standard lens close to human vision.',
        sortOrder: 10,
      },
      {
        key: '85mm-portrait',
        label: '85mm Portrait',
        description: 'Flattering compression with creamy background blur.',
        sortOrder: 20,
      },
      {
        key: '24mm-wide',
        label: '24mm Wide',
        description: 'Wide view with moderate perspective stretch.',
        sortOrder: 30,
      },
      {
        key: '14mm-ultra-wide',
        label: '14mm Ultra Wide',
        description: 'Dramatic ultra-wide perspective.',
        sortOrder: 40,
      },
      {
        key: '135mm-telephoto',
        label: '135mm Telephoto',
        description: 'Strong compression and shallow depth of field.',
        sortOrder: 50,
      },
      {
        key: '100mm-macro',
        label: '100mm Macro',
        description: 'Sharp close-focus detail.',
        sortOrder: 60,
      },
      {
        key: 'anamorphic',
        label: 'Anamorphic',
        description:
          'Widescreen cinema look with oval bokeh and horizontal flares.',
        sortOrder: 70,
      },
      {
        key: 'vintage-prime',
        label: 'Vintage Prime',
        description: 'Soft, characterful glass with gentle flare and falloff.',
        sortOrder: 80,
      },
      {
        key: 'fisheye',
        label: 'Fisheye',
        description: 'Curved ultra-wide distortion.',
        sortOrder: 90,
      },
      {
        key: 'tilt-shift',
        label: 'Tilt-Shift',
        description: 'Shifted focal plane for miniature effects.',
        sortOrder: 100,
      },
    ],
  },
  {
    table: 'elements_lightings',
    model: 'elementLighting',
    entries: [
      {
        key: 'natural',
        label: 'Natural',
        description: 'Soft available daylight.',
        sortOrder: 0,
      },
      {
        key: 'golden-hour',
        label: 'Golden Hour',
        description: 'Warm low sun with long, glowing light.',
        sortOrder: 10,
      },
      {
        key: 'studio',
        label: 'Studio',
        description: 'Clean controlled studio lighting.',
        sortOrder: 20,
      },
      {
        key: 'soft',
        label: 'Soft',
        description: 'Diffused, flattering light with gentle shadows.',
        sortOrder: 30,
      },
      {
        key: 'dramatic',
        label: 'Dramatic',
        description: 'Strong directional light and deep shadow.',
        sortOrder: 40,
      },
      {
        key: 'cinematic',
        label: 'Cinematic',
        description: 'Motivated, contrasty light shaped like a film set.',
        sortOrder: 50,
      },
      {
        key: 'neon',
        label: 'Neon',
        description: 'Colorful glowing signage and saturated accents.',
        sortOrder: 60,
      },
      {
        key: 'backlit',
        label: 'Backlit',
        description: 'Light from behind creating glow and silhouette.',
        sortOrder: 70,
      },
      {
        key: 'rim-light',
        label: 'Rim Light',
        description:
          'Bright edge light separating the subject from the background.',
        sortOrder: 80,
      },
      {
        key: 'high-key',
        label: 'High Key',
        description: 'Bright, low-contrast and airy.',
        sortOrder: 90,
      },
      {
        key: 'low-key',
        label: 'Low Key',
        description: 'Dark, high-contrast with sculpted highlights.',
        sortOrder: 100,
      },
      {
        key: 'candlelight',
        label: 'Candlelight',
        description: 'Warm flickering low light.',
        sortOrder: 110,
      },
      {
        key: 'moonlight',
        label: 'Moonlight',
        description: 'Cool, silvery night light.',
        sortOrder: 120,
      },
      {
        key: 'fluorescent',
        label: 'Fluorescent',
        description: 'Flat, slightly green overhead light.',
        sortOrder: 130,
      },
    ],
  },
  {
    table: 'elements_camera_movements',
    model: 'elementCameraMovement',
    entries: [
      {
        key: 'static',
        label: 'Static',
        description: 'Locked-off camera with no movement.',
        sortOrder: 0,
      },
      {
        key: 'pan-left',
        label: 'Pan Left',
        description: 'Camera rotates left on a fixed position.',
        sortOrder: 10,
      },
      {
        key: 'pan-right',
        label: 'Pan Right',
        description: 'Camera rotates right on a fixed position.',
        sortOrder: 20,
      },
      {
        key: 'tilt-up',
        label: 'Tilt Up',
        description: 'Camera tilts upward.',
        sortOrder: 30,
      },
      {
        key: 'tilt-down',
        label: 'Tilt Down',
        description: 'Camera tilts downward.',
        sortOrder: 40,
      },
      {
        key: 'dolly-in',
        label: 'Dolly In',
        description: 'Camera glides toward the subject.',
        sortOrder: 50,
      },
      {
        key: 'dolly-out',
        label: 'Dolly Out',
        description: 'Camera glides away from the subject.',
        sortOrder: 60,
      },
      {
        key: 'tracking',
        label: 'Tracking',
        description: 'Camera follows the subject alongside its motion.',
        sortOrder: 70,
      },
      {
        key: 'orbit',
        label: 'Orbit',
        description: 'Camera circles around the subject.',
        sortOrder: 80,
      },
      {
        key: 'crane-up',
        label: 'Crane Up',
        description: 'Camera rises smoothly like on a crane.',
        sortOrder: 90,
      },
      {
        key: 'handheld',
        label: 'Handheld',
        description: 'Organic, slightly shaky handheld feel.',
        sortOrder: 100,
      },
      {
        key: 'zoom-in',
        label: 'Zoom In',
        description: 'Lens zooms in on the subject.',
        sortOrder: 110,
      },
      {
        key: 'zoom-out',
        label: 'Zoom Out',
        description: 'Lens zooms out to reveal more.',
        sortOrder: 120,
      },
      {
        key: 'drone-flyover',
        label: 'Drone Flyover',
        description: 'Aerial pass moving over the scene.',
        sortOrder: 130,
      },
      {
        key: 'whip-pan',
        label: 'Whip Pan',
        description: 'Fast pan that blurs into a transition.',
        sortOrder: 140,
      },
    ],
  },
  {
    table: 'elements_sounds',
    model: 'elementSound',
    entries: [
      {
        key: 'cinematic-score',
        label: 'Cinematic Score',
        description: 'Sweeping film-style score.',
        sortOrder: 0,
      },
      {
        key: 'ambient',
        label: 'Ambient',
        description: 'Soft atmospheric pads and textures.',
        sortOrder: 10,
      },
      {
        key: 'upbeat-electronic',
        label: 'Upbeat Electronic',
        description: 'Driving, bright electronic beat.',
        sortOrder: 20,
      },
      {
        key: 'orchestral',
        label: 'Orchestral',
        description: 'Full orchestra with strings and brass.',
        sortOrder: 30,
      },
      {
        key: 'lofi',
        label: 'Lo-fi',
        description: 'Relaxed, dusty lo-fi beats.',
        sortOrder: 40,
      },
      {
        key: 'acoustic',
        label: 'Acoustic',
        description: 'Warm acoustic guitar and organic instruments.',
        sortOrder: 50,
      },
      {
        key: 'dramatic-tension',
        label: 'Dramatic Tension',
        description: 'Low drones and rising suspense.',
        sortOrder: 60,
      },
      {
        key: 'epic-percussion',
        label: 'Epic Percussion',
        description: 'Big drums and trailer-style hits.',
        sortOrder: 70,
      },
      {
        key: 'retro-synth',
        label: 'Retro Synth',
        description: 'Analog synthwave sound.',
        sortOrder: 80,
      },
      {
        key: 'nature-ambience',
        label: 'Nature Ambience',
        description: 'Birds, wind, water and open air.',
        sortOrder: 90,
      },
      {
        key: 'city-ambience',
        label: 'City Ambience',
        description: 'Traffic, crowds and urban hum.',
        sortOrder: 100,
      },
      {
        key: 'silence',
        label: 'Silence',
        description: 'No music or sound design.',
        sortOrder: 110,
      },
    ],
  },
];

export function studioElementId(
  table: StudioElementTable,
  key: string,
): string {
  return `c${createHash('md5').update(`${table}:${key}`).digest('hex').slice(0, 24)}`;
}
