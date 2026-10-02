import type { DirectMediaInput } from '@api/services/integrations/direct-media/direct-media.types';
import {
  compileRunwayDirectRequest,
  RUNWAY_DIRECT_MODELS,
} from '@api/services/integrations/direct-media/runway/runway-direct.contract';
import { describe, expect, it } from 'vitest';

const input: DirectMediaInput = {
  model: 'gen4.5',
  mode: 'text-to-video',
  prompt: 'A moving cloud',
  references: [],
  aspectRatio: '1280:720',
  durationSeconds: 3,
};
describe('Runway reviewed contract', () => {
  it('compiles the native integer duration rather than aggregator 5/10 restrictions', () => {
    expect(compileRunwayDirectRequest(input)).toMatchObject({
      provider: 'runway',
      endpoint: '/v1/text_to_video',
      body: {
        model: 'gen4.5',
        promptText: input.prompt,
        ratio: '1280:720',
        duration: 3,
      },
    });
    expect(RUNWAY_DIRECT_MODELS.map((model) => model.model)).toEqual([
      'gen4.5',
      'gen4_image_turbo',
    ]);
  });
  it('compiles one first frame and all turbo image references', () => {
    expect(
      compileRunwayDirectRequest({
        ...input,
        mode: 'image-to-video',
        references: [{ url: 'https://assets.example/frame.png' }],
        aspectRatio: '960:960',
      }).body.promptImage,
    ).toBe('https://assets.example/frame.png');
    expect(
      compileRunwayDirectRequest({
        ...input,
        model: 'gen4_image_turbo',
        mode: 'image-edit',
        durationSeconds: undefined,
        references: [
          { url: 'https://assets.example/a.png' },
          { url: 'https://assets.example/b.png' },
        ],
        aspectRatio: '2112:912',
      }),
    ).toMatchObject({
      endpoint: '/v1/text_to_image',
      body: {
        referenceImages: [
          { uri: 'https://assets.example/a.png' },
          { uri: 'https://assets.example/b.png' },
        ],
      },
    });
  });
  it.each([
    { durationSeconds: 1 },
    { durationSeconds: 2.5 },
    { durationSeconds: 11 },
    { aspectRatio: '960:960' },
    { resolution: '720p' },
    { prompt: '😀'.repeat(501) },
    { seed: -1 },
    { width: 1280 },
    { references: [{ url: 'https://assets.example/a.png' }] },
  ])('rejects unsupported controls before submission: %j', (change) => {
    expect(() => compileRunwayDirectRequest({ ...input, ...change })).toThrow();
  });
  it('requires 1–3 image references and rejects unsafe URLs', () => {
    for (const references of [
      [],
      Array.from({ length: 4 }, () => ({
        url: 'https://assets.example/a.png',
      })),
      [{ url: 'http://assets.example/a.png' }],
      [{ url: 'https://user:pass@assets.example/a.png' }],
    ]) {
      expect(() =>
        compileRunwayDirectRequest({
          ...input,
          model: 'gen4_image_turbo',
          mode: 'text-to-image',
          durationSeconds: undefined,
          aspectRatio: '1024:1024',
          references,
        }),
      ).toThrow();
    }
  });
  it.each([
    '1024:1024',
    '1080:1080',
    '1168:880',
    '1360:768',
    '1440:1080',
    '1080:1440',
    '1808:768',
    '1920:1080',
    '1080:1920',
    '2112:912',
    '1280:720',
    '720:1280',
    '720:720',
    '960:720',
    '720:960',
    '1680:720',
  ])('supports documented image ratio %s', (aspectRatio) => {
    expect(
      compileRunwayDirectRequest({
        ...input,
        model: 'gen4_image_turbo',
        mode: 'text-to-image',
        durationSeconds: undefined,
        references: [{ url: 'https://assets.example/a.png' }],
        aspectRatio,
      }).body.ratio,
    ).toBe(aspectRatio);
  });
});
