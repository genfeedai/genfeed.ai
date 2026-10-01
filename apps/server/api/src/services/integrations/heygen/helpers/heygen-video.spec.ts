import { describe, expect, it } from 'vitest';

import {
  buildHeyGenVideoCreateBody,
  HEYGEN_VIDEO_PROMPT_MAX,
} from './heygen-video';

describe('buildHeyGenVideoCreateBody', () => {
  it('uses text-to-video and a default aspect ratio when there are no assets', () => {
    expect(
      buildHeyGenVideoCreateBody({
        imageUrls: [],
        prompt: 'a skyline at dusk',
        videoUrls: [],
      }),
    ).toEqual({
      aspect_ratio: '16:9',
      duration: 5,
      mode: 'text_to_video',
      model: 'heygen-video-1',
      prompt: 'a skyline at dusk',
      prompt_enhancement: 'disabled',
      resolution: '768p',
    });
  });

  it('omits aspect ratio for a single still', () => {
    expect(
      buildHeyGenVideoCreateBody({
        aspectRatio: '9:16',
        imageUrls: ['https://cdn.test/face.png'],
        prompt: 'walk forward',
        videoUrls: [],
      }),
    ).toMatchObject({
      image: { type: 'url', url: 'https://cdn.test/face.png' },
      mode: 'image_to_video',
    });
    expect(
      buildHeyGenVideoCreateBody({
        imageUrls: ['https://cdn.test/face.png'],
        prompt: 'walk forward',
        videoUrls: [],
      }),
    ).not.toHaveProperty('aspect_ratio');
  });

  it('folds the first still into reference images when a clip is present', () => {
    expect(
      buildHeyGenVideoCreateBody({
        imageUrls: ['https://cdn.test/face.png', 'https://cdn.test/alt.png'],
        prompt: 'match the clip',
        videoUrls: ['https://cdn.test/walk.mp4'],
      }),
    ).toMatchObject({
      mode: 'reference_to_video',
      reference_images: [
        { type: 'url', url: 'https://cdn.test/face.png' },
        { type: 'url', url: 'https://cdn.test/alt.png' },
      ],
      reference_videos: [{ type: 'url', url: 'https://cdn.test/walk.mp4' }],
    });
  });

  it('caps the prompt at the published schema length', () => {
    const body = buildHeyGenVideoCreateBody({
      imageUrls: [],
      prompt: 'a'.repeat(HEYGEN_VIDEO_PROMPT_MAX + 20),
      videoUrls: [],
    });

    expect(body.prompt).toHaveLength(HEYGEN_VIDEO_PROMPT_MAX);
  });

  it('rejects more references than HeyGen accepts', () => {
    expect(() =>
      buildHeyGenVideoCreateBody({
        imageUrls: Array.from(
          { length: 10 },
          (_, index) => `https://cdn.test/${index}.png`,
        ),
        prompt: 'too many',
        videoUrls: [],
      }),
    ).toThrow('at most 9 images');
  });
});
