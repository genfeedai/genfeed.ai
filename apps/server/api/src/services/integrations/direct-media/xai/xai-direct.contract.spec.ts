import { describe, expect, it } from 'bun:test';
import type { DirectMediaInput } from '@api/services/integrations/direct-media/direct-media.types';
import { compileXaiDirectRequest, XAI_DIRECT_MODELS } from '@api/services/integrations/direct-media/xai/xai-direct.contract';

const image: DirectMediaInput = { model: 'grok-imagine-image-2.0', mode: 'text-to-image', prompt: 'A lighthouse', references: [] };
const video: DirectMediaInput = { ...image, model: 'grok-imagine-video-1.5', mode: 'text-to-video' };
const refs = [{ url: 'https://assets.example/a.png' }, { url: 'https://assets.example/b.png' }];

describe('compileXaiDirectRequest', () => {
  it('publishes direct identities and reviewed supported modes', () => {
    expect(XAI_DIRECT_MODELS.map((model) => model.model)).toEqual(['grok-imagine-image-2.0', 'grok-imagine-video-1.5']);
    expect(XAI_DIRECT_MODELS.every((model) => model.provider === 'xai' && model.cancellation === 'unsupported')).toBe(true);
  });
  it('compiles synchronous image generation controls', () => {
    expect(compileXaiDirectRequest({ ...image, aspectRatio: '16:9', resolution: '2k' })).toMatchObject({ provider: 'xai', endpoint: 'https://api.x.ai/v1/images/generations', body: { model: image.model, prompt: image.prompt, aspect_ratio: '16:9', resolution: '2k' } });
  });
  it('uses image for one edit reference and images for multiple references', () => {
    expect(compileXaiDirectRequest({ ...image, mode: 'image-edit', references: refs.slice(0, 1) }).body).toEqual({ model: image.model, prompt: image.prompt, image: { url: refs[0].url, type: 'image_url' } });
    expect(compileXaiDirectRequest({ ...image, mode: 'image-edit', references: refs }).body).toEqual({ model: image.model, prompt: image.prompt, images: refs.map((ref) => ({ url: ref.url, type: 'image_url' })) });
  });
  it('compiles video duration, resolution, ratio and starting image', () => {
    expect(compileXaiDirectRequest({ ...video, mode: 'image-to-video', references: refs.slice(0, 1), durationSeconds: 15, resolution: '1080p', aspectRatio: '2:3' })).toMatchObject({ endpoint: 'https://api.x.ai/v1/videos/generations', body: { model: video.model, prompt: video.prompt, duration: 15, resolution: '1080p', aspect_ratio: '2:3', image: { url: refs[0].url, type: 'image_url' } } });
  });
  it('rejects unreviewed models and incompatible modes', () => {
    for (const input of [{ ...image, model: 'x-ai/grok-imagine-image-2.0' }, { ...image, model: 'grok-imagine-image' }, { ...image, mode: 'text-to-video' as const }, { ...video, mode: 'image-edit' as const }]) expect(() => compileXaiDirectRequest(input)).toThrow();
  });
  it('rejects unknown controls, unsupported controls and empty prompts', () => {
    for (const input of [{ ...image, seed: 1 }, { ...image, width: 1024 }, { ...image, height: 1024 }, { ...image, durationSeconds: 1 }, { ...image, resolution: '1080p' }, { ...video, resolution: '2k' }, { ...video, aspectRatio: '21:9' }, { ...image, prompt: ' ' }, { ...image, quality: 'low' }]) expect(() => compileXaiDirectRequest(input)).toThrow();
  });
  it('enforces video duration boundaries and finite values', () => {
    for (const durationSeconds of [0, 16, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) expect(() => compileXaiDirectRequest({ ...video, durationSeconds })).toThrow();
    for (const durationSeconds of [1, 15]) expect(compileXaiDirectRequest({ ...video, durationSeconds }).body.duration).toBe(durationSeconds);
  });
  it('enforces reference counts and admitted HTTPS image URL shape', () => {
    for (const input of [{ ...image, references: refs }, { ...image, mode: 'image-edit' as const }, { ...image, mode: 'image-edit' as const, references: Array.from({ length: 6 }, () => refs[0]) }, { ...video, mode: 'image-to-video' as const, references: refs }]) expect(() => compileXaiDirectRequest(input)).toThrow();
    for (const url of ['http://assets.example/a.png', 'data:image/png;base64,AA==', 'https://user:password@assets.example/a.png', 'not-a-url']) expect(() => compileXaiDirectRequest({ ...image, mode: 'image-edit', references: [{ url }] })).toThrow();
    expect(() => compileXaiDirectRequest({ ...image, mode: 'image-edit', references: [{ ...refs[0], mimeType: 'video/mp4' }] })).toThrow();
  });
});
