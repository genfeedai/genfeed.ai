export interface ElementLabel {
  label: string;
  description: string;
}

export const ELEMENT_LABELS: Record<string, ElementLabel> = {
  blacklists: {
    description: 'Manage restricted content and blocked elements',
    label: 'Blacklists',
  },
  'camera-movements': {
    description:
      'Define camera motion patterns and movement styles for dynamic shots',
    label: 'Camera Movements',
  },
  cameras: {
    description:
      'Configure camera settings and perspectives for video generation',
    label: 'Cameras',
  },
  'font-families': {
    description:
      'Manage typography and font family options for content creation',
    label: 'Font Families',
  },
  lenses: {
    description: 'Manage lens types and focal lengths for video generation',
    label: 'Lenses',
  },
  lightings: {
    description: 'Configure lighting setups and effects for scene ambiance',
    label: 'Lightings',
  },
  moods: {
    description: 'Manage emotional tones and atmospheres for your content',
    label: 'Moods',
  },
  scenes: {
    description: 'Create and organize scene templates for video production',
    label: 'Scenes',
  },
  sounds: {
    description: 'Manage audio elements and sound effects for your content',
    label: 'Sounds',
  },
  styles: {
    description:
      'Define visual styles and design patterns for consistent branding',
    label: 'Styles',
  },
};

export type ElementType = keyof typeof ELEMENT_LABELS;
