import { ContentTemplateKey } from '../enums/template.enum';
import type { IPreset } from '../interfaces/elements/preset.interface';
import type { GenerationSetupValues } from '../interfaces/studio/generation-setup.interface';

/** Initial system templates. Persisted admin edits own the catalog after seeding. */
export const STUDIO_SYSTEM_PRESETS = [
  {
    key: 'studio-profile-picture',
    label: 'Profile picture',
    type: 'image',
    description: 'A clean portrait with room for a circular crop.',
    prompt: 'Create a professional profile picture of your subject.',
    values: {
      aspectRatio: '1:1',
      promptTemplate: ContentTemplateKey.IMAGE_DEFAULT,
      style: 'professional portrait photography',
      scene: 'simple studio background',
      camera: 'eye-level close-up',
      lighting: 'soft studio lighting',
    } satisfies Partial<GenerationSetupValues>,
  },
  {
    key: 'studio-banner',
    label: 'Banner',
    type: 'image',
    description: 'A wide composition with space for your headline.',
    prompt: 'Create a wide banner for your topic or brand.',
    values: {
      aspectRatio: '21:9',
      promptTemplate: ContentTemplateKey.IMAGE_BANNER,
      style: 'editorial brand banner',
      scene: 'wide composition with clear negative space for a headline',
    } satisfies Partial<GenerationSetupValues>,
  },
  {
    key: 'studio-youtube-thumbnail',
    label: 'YouTube thumbnail',
    type: 'image',
    description: 'A bold focal point that reads at small sizes.',
    prompt: 'Create a YouTube thumbnail for your video topic.',
    values: {
      aspectRatio: '16:9',
      promptTemplate: ContentTemplateKey.IMAGE_SOCIAL_ILLUSTRATION,
      style: 'high-contrast YouTube thumbnail',
      scene:
        'one expressive focal subject, clear background and room for a short headline',
    } satisfies Partial<GenerationSetupValues>,
  },
  {
    key: 'studio-meme',
    label: 'Meme',
    type: 'video',
    description: 'A short reaction with a quick setup and punchline.',
    prompt: 'Create a short reaction meme about your topic.',
    values: {
      aspectRatio: '9:16',
      duration: 5,
      promptTemplate: ContentTemplateKey.VIDEO_SOCIAL,
      style: 'short reaction meme',
      scene: 'quick visual setup followed by an expressive punchline',
      cameraMovement: 'static',
    } satisfies Partial<GenerationSetupValues>,
  },
  {
    key: 'studio-animation',
    label: 'Animation',
    type: 'video',
    description: 'A playful animated scene with clear movement.',
    prompt: 'Animate your subject in a short playful scene.',
    values: {
      aspectRatio: '16:9',
      duration: 5,
      promptTemplate: ContentTemplateKey.VIDEO_DEFAULT,
      style: 'stylized 3D animation',
      scene: 'playful animated scene with smooth deliberate movement',
      cameraMovement: 'slow push-in',
    } satisfies Partial<GenerationSetupValues>,
  },
  {
    key: 'studio-dance',
    label: 'Dance',
    type: 'video',
    description: 'A full-body performance with room to move.',
    prompt: 'Create a short dance performance featuring your subject.',
    values: {
      aspectRatio: '9:16',
      duration: 5,
      promptTemplate: ContentTemplateKey.VIDEO_SOCIAL,
      style: 'energetic dance performance',
      scene: 'full-body subject on a clear stage, rhythmic choreography',
      camera: 'full-body wide shot',
      cameraMovement: 'static',
    } satisfies Partial<GenerationSetupValues>,
  },
] as const;

export type StudioSystemPreset = {
  key: (typeof STUDIO_SYSTEM_PRESETS)[number]['key'];
  label: string;
  description: string;
  prompt: string;
  type: 'image' | 'video';
  values: Partial<GenerationSetupValues> &
    Pick<GenerationSetupValues, 'aspectRatio'>;
};

export function studioSystemPresetId(key: StudioSystemPreset['key']): string {
  return `cpresetbuiltin${key.replaceAll('-', '')}`;
}

/** Only live platform rows with the reserved ID may supply a built-in template. */
export function resolveStudioSystemPresets(
  catalog: readonly Partial<IPreset>[],
  type: string,
): StudioSystemPreset[] {
  return STUDIO_SYSTEM_PRESETS.flatMap((seed): StudioSystemPreset[] => {
    const row = catalog.find(
      (preset) => preset.id === studioSystemPresetId(seed.key),
    );
    if (
      !row?.isActive ||
      row.isDeleted ||
      row.organizationId !== null ||
      row.brandId !== null ||
      row.category !== type ||
      (type !== 'image' && type !== 'video') ||
      !row.label?.trim() ||
      typeof row.prompt !== 'string'
    )
      return [];
    // Older rows can omit the ratio. Invalid persisted ratios are never applied.
    const aspectRatio = row.aspectRatio || seed.values.aspectRatio;
    if (
      !/^[1-9]\d*(?:\.\d+)?:[1-9]\d*(?:\.\d+)?$/.test(aspectRatio) ||
      (row.duration != null &&
        (!Number.isFinite(row.duration) ||
          row.duration <= 0 ||
          row.duration > 3600))
    )
      return [];
    const values: StudioSystemPreset['values'] = { aspectRatio };
    if (row.duration != null) values.duration = row.duration;
    for (const field of [
      'camera',
      'cameraMovement',
      'lens',
      'lighting',
      'mood',
      'promptTemplate',
      'scene',
      'style',
    ] as const) {
      if (typeof row[field] === 'string') values[field] = row[field];
    }
    return [
      {
        key: seed.key,
        label: row.label,
        description: row.description ?? '',
        prompt: row.prompt,
        type,
        values,
      },
    ];
  });
}
