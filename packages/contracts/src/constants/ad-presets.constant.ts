import type { AdPreset } from '../api-types/contracts/ad-preset.contract';

export const AD_PRESET_AUDIO_NOTICE =
  'Reference audio steers the voice. There is no unchanged-audio guarantee.';

const sections: AdPreset['sections'] = [
  {
    key: 'goal',
    title: 'Generation Goal',
    template: 'Create a {{aspectRatio}} video lasting {{duration}} seconds.',
  },
  {
    key: 'no_words',
    title: 'No Words On Screen',
    template:
      'Do not add captions, titles, logos or other generated words on screen.',
  },
  {
    key: 'references',
    title: 'Reference Material Roles',
    template: '{{referenceRoles}}',
  },
  {
    key: 'dialogue',
    title: 'Dialogue',
    template:
      'Say "{{dialogue}}". Use the same words, same number of words, same order.',
  },
  {
    key: 'subjects',
    title: 'Subjects and Relationships',
    template:
      'Keep the referenced person recognizable and interacting naturally with the setting.',
  },
  {
    key: 'scale',
    title: 'Scale and Proportion',
    template:
      'Keep human anatomy, objects and surroundings at realistic proportions.',
  },
  {
    key: 'camera',
    title: 'Camera',
    template: '{{lensMm}} mm lens; compose for {{aspectRatio}}.',
  },
  { key: 'quality', title: 'Picture Quality', template: '{{qualityLook}}' },
  {
    key: 'lighting',
    title: 'Lighting',
    template: 'Use believable, consistent light that suits the setting.',
  },
  {
    key: 'performance',
    title: 'Performance',
    template: 'Speak naturally with restrained gestures and expressions.',
  },
  {
    key: 'events',
    title: 'Event Script',
    template:
      'Start with an attentive look, deliver the dialogue, then settle naturally.',
  },
  { key: 'audio', title: 'Audio', template: AD_PRESET_AUDIO_NOTICE },
  {
    key: 'consistency',
    title: 'Maintain Consistency',
    template: 'Maintain identity, wardrobe, setting and lighting throughout.',
  },
];

/** Initial platform templates; persisted edits own the catalog after insertion. */
export const AD_PRESETS: AdPreset[] = [
  {
    key: 'ad-ugc-selfie',
    label: 'UGC selfie ad',
    description: `A casual handheld selfie ad. ${AD_PRESET_AUDIO_NOTICE}`,
    speaking: true,
    sections: sections.map((section) =>
      section.key === 'camera'
        ? {
            ...section,
            template:
              'Handheld phone selfie, {{lensMm}} mm lens, {{aspectRatio}}; subtle natural movement.',
          }
        : section,
    ),
  },
  {
    key: 'ad-talking-head',
    label: 'Talking head',
    description: `A direct-to-camera presentation. ${AD_PRESET_AUDIO_NOTICE}`,
    speaking: true,
    sections,
  },
  {
    key: 'ad-screen-demo',
    label: 'Screen demo',
    description: `A narrated screen demonstration. ${AD_PRESET_AUDIO_NOTICE}`,
    speaking: true,
    sections: sections.map((section) =>
      section.key === 'subjects'
        ? {
            ...section,
            template:
              'Show the referenced screen content clearly while the voiceover explains it.',
          }
        : section,
    ),
  },
];

export function adPresetId(key: string): string {
  return `cpresetbuiltin${key.replaceAll('-', '')}`;
}
