import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  adaptFalImageRequest,
  adaptFalVideoRequest,
  classifyFalSchemaFamily,
  extractFalEndpointSchemas,
  FalSchemaFamily,
} from './fal-contract';

const fixtureDir = fileURLToPath(
  new URL('../../../../../../workers/test/fixtures/fal/', import.meta.url),
);

function fixture(name: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(fixtureDir, name), 'utf8')) as Record<
    string,
    unknown
  >;
}

describe('reviewed Fal execution contracts', () => {
  it('extracts referenced input/output schemas and classifies modern image edit', () => {
    const schemas = extractFalEndpointSchemas(fixture('image-openapi.json'));

    expect(schemas.input.required).toEqual(['prompt', 'image_urls']);
    expect(schemas.output.required).toEqual(['images']);
    expect(
      classifyFalSchemaFamily('image-to-image', schemas.input, schemas.output),
    ).toBe(FalSchemaFamily.IMAGE_EDIT_MULTI);
  });

  it('adapts a modern multi-image request through its reviewed family', () => {
    const { input } = extractFalEndpointSchemas(fixture('image-openapi.json'));

    expect(
      adaptFalImageRequest(FalSchemaFamily.IMAGE_EDIT_MULTI, input, {
        height: 768,
        prompt: 'put this product in a studio',
        referenceImageUrls: ['https://cdn.test/a.png'],
        seed: 42,
        width: 1024,
      }),
    ).toEqual({
      image_size: { height: 768, width: 1024 },
      image_urls: ['https://cdn.test/a.png'],
      prompt: 'put this product in a studio',
      seed: 42,
    });
  });

  it('rejects a reviewed image-edit contract when a required reference is absent', () => {
    const { input } = extractFalEndpointSchemas(fixture('image-openapi.json'));

    expect(() =>
      adaptFalImageRequest(FalSchemaFamily.IMAGE_EDIT_MULTI, input, {
        height: 768,
        prompt: 'edit this',
        referenceImageUrls: [],
        width: 1024,
      }),
    ).toThrow('Fal input is missing required field: image_urls');
  });

  it('classifies image-to-video and coerces duration to the reviewed string contract', () => {
    const schemas = extractFalEndpointSchemas(fixture('video-openapi.json'));
    const family = classifyFalSchemaFamily(
      'image-to-video',
      schemas.input,
      schemas.output,
    );

    expect(family).toBe(FalSchemaFamily.VIDEO_IMAGE);
    expect(
      adaptFalVideoRequest(family, schemas.input, {
        duration: 5,
        imageUrl: 'https://cdn.test/start.png',
        prompt: 'slow camera push',
        promptParams: { resolution: '1080p' },
      }),
    ).toEqual({
      duration: '5',
      image_url: 'https://cdn.test/start.png',
      prompt: 'slow camera push',
      resolution: '1080p',
    });
  });

  it('does not classify arbitrary or unsupported schemas as executable', () => {
    expect(
      classifyFalSchemaFamily(
        'training',
        { properties: { checkpoint: { type: 'string' } }, type: 'object' },
        { properties: { weights: { type: 'string' } }, type: 'object' },
      ),
    ).toBeNull();
  });
});
