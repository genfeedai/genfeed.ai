import type { DirectMediaInput } from '@api/services/integrations/direct-media/direct-media.types';
import {
  compileGoogleDirectRequest,
  GOOGLE_DIRECT_MODELS,
} from '@api/services/integrations/direct-media/google/google-direct.contract';
import { describe, expect, it } from 'vitest';

const nano: DirectMediaInput = {
  model: 'gemini-3.1-flash-image',
  mode: 'text-to-image',
  prompt: 'A tree',
  references: [],
};
describe('Google direct compiler', () => {
  it('compiles Nano Banana Interactions image settings', () => {
    expect(
      compileGoogleDirectRequest({
        ...nano,
        aspectRatio: '16:9',
        resolution: '2K',
      }),
    ).toMatchObject({
      provider: 'google',
      endpoint: 'https://generativelanguage.googleapis.com/v1beta/interactions',
      body: {
        model: nano.model,
        input: nano.prompt,
        response_format: {
          type: 'image',
          aspect_ratio: '16:9',
          image_size: '2K',
        },
      },
    });
    expect(GOOGLE_DIRECT_MODELS).toHaveLength(3);
  });
  it('encodes 14 admitted editing references without silently dropping any', () => {
    const references = Array.from({ length: 14 }, () => ({
      url: 'https://assets.example/image.png',
      mimeType: 'image/png',
    }));
    const request = compileGoogleDirectRequest({
      ...nano,
      mode: 'image-edit',
      references,
    });
    expect(request.body.input).toEqual([
      { type: 'text', text: nano.prompt },
      ...references.map((ref) => ({
        type: 'image',
        uri: ref.url,
        mime_type: ref.mimeType,
      })),
    ]);
    expect(() =>
      compileGoogleDirectRequest({
        ...nano,
        mode: 'image-edit',
        references: [...references, references[0]],
      }),
    ).toThrow();
  });
  it.each([
    { width: 1024 },
    { height: 1024 },
    { seed: 1 },
    { durationSeconds: 4 },
    { resolution: '720p' },
    { aspectRatio: 'invalid' },
  ])('rejects unsupported image controls %j', (controls) => {
    expect(() =>
      compileGoogleDirectRequest({ ...nano, ...controls }),
    ).toThrow();
  });
  it('compiles synchronous Omni with explicit inline delivery and task', () => {
    expect(
      compileGoogleDirectRequest({
        ...nano,
        model: 'gemini-omni-1.1-flash',
        mode: 'image-to-video',
        references: [{ url: 'data:image/png;base64,YQ==' }],
        resolution: '1080p',
        aspectRatio: '9:16',
      }).body,
    ).toEqual({
      model: 'gemini-omni-1.1-flash',
      input: [
        { type: 'text', text: 'A tree' },
        { type: 'image', data: 'YQ==', mime_type: 'image/png' },
      ],
      response_format: {
        type: 'video',
        delivery: 'inline',
        resolution: '1080p',
        aspect_ratio: '9:16',
      },
      generation_config: { video_config: { task: 'image_to_video' } },
    });
    expect(() =>
      compileGoogleDirectRequest({
        ...nano,
        model: 'gemini-omni-1.1-flash',
        mode: 'text-to-video',
        durationSeconds: 8,
      }),
    ).toThrow();
  });
  it('compiles Veo LRO and enforces higher-resolution duration', () => {
    expect(
      compileGoogleDirectRequest({
        ...nano,
        model: 'veo-3.1-generate-preview',
        mode: 'image-to-video',
        references: [{ url: 'data:image/png;base64,YQ==' }],
        durationSeconds: 8,
        resolution: '4k',
      }).body,
    ).toEqual({
      instances: [
        {
          prompt: 'A tree',
          image: { bytesBase64Encoded: 'YQ==', mimeType: 'image/png' },
        },
      ],
      parameters: { durationSeconds: 8, resolution: '4k' },
    });
    expect(() =>
      compileGoogleDirectRequest({
        ...nano,
        model: 'veo-3.1-generate-preview',
        mode: 'text-to-video',
        durationSeconds: 6,
        resolution: '1080p',
      }),
    ).toThrow();
  });
  it.each(['unknown', 'gemini-flash-latest'])(
    'fails closed for unreviewed model %s',
    (model) => {
      expect(() => compileGoogleDirectRequest({ ...nano, model })).toThrow();
    },
  );
  it('rejects mismatched modes, missing refs, unsafe refs and extra runtime fields', () => {
    expect(() =>
      compileGoogleDirectRequest({ ...nano, mode: 'image-edit' }),
    ).toThrow();
    expect(() =>
      compileGoogleDirectRequest({ ...nano, mode: 'text-to-video' }),
    ).toThrow();
    expect(() =>
      compileGoogleDirectRequest({
        ...nano,
        references: [{ url: 'https://assets.example/a' }],
      }),
    ).toThrow();
    expect(() =>
      compileGoogleDirectRequest({
        ...nano,
        mode: 'image-edit',
        references: [{ url: 'http://assets.example/a' }],
      }),
    ).toThrow();
    expect(() =>
      compileGoogleDirectRequest(Object.assign({}, nano, { background: true })),
    ).toThrow();
  });
});
