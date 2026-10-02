import {
  BFL_DIRECT_MODELS,
  compileBflDirectRequest,
} from '@api/services/integrations/direct-media/bfl/bfl-direct.contract';
import type { DirectMediaInput } from '@api/services/integrations/direct-media/direct-media.types';
import { describe, expect, it } from 'vitest';

const input: DirectMediaInput = {
  model: 'flux-2-pro',
  mode: 'text-to-image',
  prompt: 'A blue bird',
  references: [],
};

describe('BFL direct compiler', () => {
  it('pins the fixed snapshot and maps documented controls without invented defaults', () => {
    expect(BFL_DIRECT_MODELS).toHaveLength(1);
    expect(
      compileBflDirectRequest({
        ...input,
        width: 1440,
        height: 2048,
        seed: 42,
      }),
    ).toMatchObject({
      provider: 'bfl',
      model: 'flux-2-pro',
      mode: 'text-to-image',
      endpoint: 'https://api.bfl.ai/v1/flux-2-pro',
      body: {
        prompt: input.prompt,
        width: 1440,
        height: 2048,
        seed: 42,
        output_format: 'jpeg',
      },
    });
    expect(compileBflDirectRequest(input).body).toEqual({
      prompt: input.prompt,
      output_format: 'jpeg',
    });
  });
  it('maps one through eight tenant-admitted references to the numbered fields', () => {
    const references = Array.from({ length: 8 }, (_, index) => ({
      url: `https://assets.example/image-${index}.png`,
      mimeType: 'image/png',
    }));
    const body = compileBflDirectRequest({
      ...input,
      mode: 'image-edit',
      references,
    }).body;
    expect(body.input_image).toBe(references[0].url);
    for (let index = 1; index < 8; index++)
      expect(body[`input_image_${index + 1}`]).toBe(references[index].url);
    expect(body).not.toHaveProperty('input_image_1');
  });
  it.each([
    { model: 'flux-2-pro-preview' },
    { model: 'bfl/flux-2-pro' },
    { mode: 'text-to-video' },
    { prompt: ' ' },
    { width: 63 },
    { height: 63 },
    { width: 1024.5 },
    { seed: 1.5 },
    { seed: Number.MAX_SAFE_INTEGER + 1 },
    { aspectRatio: '1:1' },
    { durationSeconds: 5 },
    { resolution: '1k' },
    { references: [{ url: 'https://assets.example/a.png' }] },
    { mode: 'image-edit', references: [] },
    {
      mode: 'image-edit',
      references: Array.from({ length: 9 }, () => ({
        url: 'https://assets.example/a.png',
      })),
    },
    {
      mode: 'image-edit',
      references: [{ url: 'http://assets.example/a.png' }],
    },
    {
      mode: 'image-edit',
      references: [{ url: 'https://user:password@assets.example/a.png' }],
    },
    {
      mode: 'image-edit',
      references: [
        { url: 'https://assets.example/a.mp4', mimeType: 'video/mp4' },
      ],
    },
  ])('rejects unsupported input before transport: %j', (override) => {
    expect(() =>
      compileBflDirectRequest({ ...input, ...override } as DirectMediaInput),
    ).toThrow();
  });
  it('accepts documented integer dimension and seed boundaries without guessing model limits', () => {
    expect(
      compileBflDirectRequest({ ...input, width: 64, height: 65, seed: -1 })
        .body,
    ).toMatchObject({ width: 64, height: 65, seed: -1 });
  });
});
