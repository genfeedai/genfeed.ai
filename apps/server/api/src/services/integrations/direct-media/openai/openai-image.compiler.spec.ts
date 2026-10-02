import {
  type DirectMediaInput,
  DirectMediaProviderError,
} from '@api/services/integrations/direct-media/direct-media.types';
import {
  compileOpenAIImageRequest,
  OPENAI_IMAGE_CONTRACT,
} from '@api/services/integrations/direct-media/openai/openai-image.compiler';
import { describe, expect, it } from 'vitest';

function input(overrides: Partial<DirectMediaInput> = {}): DirectMediaInput {
  return {
    model: 'gpt-image-2',
    mode: 'text-to-image',
    prompt: 'Draw a mountain',
    references: [],
    ...overrides,
  };
}
function reject(value: unknown): void {
  expect(() => compileOpenAIImageRequest(value as DirectMediaInput)).toThrow(
    DirectMediaProviderError,
  );
}

describe('OpenAI image compiler', () => {
  it('compiles the exact nonstreaming generation contract', () => {
    expect(compileOpenAIImageRequest(input())).toEqual({
      provider: 'openai',
      model: 'gpt-image-2',
      mode: 'text-to-image',
      contractVersion: 'openai-gpt-image-2-2026-10-02',
      endpoint: 'https://api.openai.com/v1/images/generations',
      body: {
        model: 'gpt-image-2',
        prompt: 'Draw a mountain',
        size: 'auto',
        n: 1,
        quality: 'auto',
        output_format: 'png',
        background: 'opaque',
        moderation: 'auto',
        stream: false,
      },
    });
    expect(OPENAI_IMAGE_CONTRACT).toMatchObject({
      provider: 'openai',
      model: 'gpt-image-2',
      modes: ['text-to-image', 'image-edit'],
      maxReferences: 16,
      cancellation: 'unsupported',
    });
  });

  it('keeps the reviewed metadata and nested arrays immutable', () => {
    expect(Object.isFrozen(OPENAI_IMAGE_CONTRACT)).toBe(true);
    expect(Object.isFrozen(OPENAI_IMAGE_CONTRACT.modes)).toBe(true);
    expect(Object.isFrozen(OPENAI_IMAGE_CONTRACT.sourceUrls)).toBe(true);
    expect(Reflect.set(OPENAI_IMAGE_CONTRACT, 'maxReferences', 100)).toBe(
      false,
    );
    expect(Reflect.set(OPENAI_IMAGE_CONTRACT.modes, '0', 'text-to-video')).toBe(
      false,
    );
    expect(
      Reflect.set(
        OPENAI_IMAGE_CONTRACT.sourceUrls,
        '0',
        'https://unreviewed.example',
      ),
    ).toBe(false);
    expect(OPENAI_IMAGE_CONTRACT.maxReferences).toBe(16);
    expect(OPENAI_IMAGE_CONTRACT.modes[0]).toBe('text-to-image');
    expect(OPENAI_IMAGE_CONTRACT.sourceUrls[0]).toBe(
      'https://developers.openai.com/api/docs/models/gpt-image-2',
    );
  });

  it('preserves sixteen ordered admitted references in the official JSON edit shape', () => {
    const references = Array.from({ length: 16 }, (_, index) => ({
      url: `https://assets.example/${index}.png?signature=admitted`,
      mimeType: 'image/png',
    }));
    const compiled = compileOpenAIImageRequest(
      input({
        mode: 'image-edit',
        references,
        width: 1024,
        height: 1024,
        aspectRatio: '1:1',
      }),
    );
    expect(compiled.endpoint).toBe('https://api.openai.com/v1/images/edits');
    expect(compiled.body).toEqual({
      model: 'gpt-image-2',
      prompt: 'Draw a mountain',
      size: '1024x1024',
      n: 1,
      quality: 'auto',
      output_format: 'png',
      background: 'opaque',
      moderation: 'auto',
      stream: false,
      images: references.map(({ url }) => ({ image_url: url })),
    });
    expect(compiled.body).not.toHaveProperty('input_fidelity');
    expect(compiled.body).not.toHaveProperty('response_format');
    expect(compiled.body).not.toHaveProperty('style');
  });

  it.each([
    [640, 1024],
    [3840, 2160],
    [2400, 800],
    [800, 2400],
  ])('accepts documented boundary dimensions %i x %i', (width, height) => {
    expect(compileOpenAIImageRequest(input({ width, height })).body.size).toBe(
      `${width}x${height}`,
    );
  });
  it.each([
    [624, 1024],
    [3840, 2176],
    [3856, 1024],
    [2416, 800],
    [800, 2416],
    [1025, 1024],
    [0, 1024],
    [-16, 1024],
    [1024.5, 1024],
    [NaN, 1024],
    [Infinity, 1024],
  ])('rejects unsupported dimensions %i x %i', (width, height) =>
    reject(input({ width, height })),
  );
  it.each([
    { width: 1024 },
    { height: 1024 },
    { aspectRatio: '1:1' },
    { width: 1024, height: 1024, aspectRatio: '16:9' },
    { width: 1024, height: 1024, aspectRatio: '0:0' },
    { width: 1024, height: 1024, aspectRatio: 'auto' },
    { seed: 0 },
    { durationSeconds: 1 },
    { resolution: '1K' },
  ])('rejects partial or unsupported controls %j', (controls) =>
    reject(input(controls)),
  );

  it('accepts the prompt limit without changing prompt text', () => {
    const prompt = ` ${'x'.repeat(31998)} `;
    expect(compileOpenAIImageRequest(input({ prompt })).body.prompt).toBe(
      prompt,
    );
  });
  it.each(['', '  \n ', 'x'.repeat(32001)])(
    'rejects invalid prompt length',
    (prompt) => reject(input({ prompt })),
  );
  it.each(['openai/gpt-image-2', 'gpt-image-2-2026-04-21', 'gpt-image-2.5'])(
    'rejects unreviewed or aggregator model %s',
    (model) => reject(input({ model })),
  );
  it.each(['text-to-video', 'image-to-video', 'unknown'])(
    'rejects mode %s',
    (mode) => reject({ ...input(), mode }),
  );
  it('enforces mode-specific reference counts', () => {
    reject(input({ references: [{ url: 'https://assets.example/a.png' }] }));
    reject(input({ mode: 'image-edit' }));
    reject(
      input({
        mode: 'image-edit',
        references: Array.from({ length: 17 }, () => ({
          url: 'https://assets.example/a.png',
        })),
      }),
    );
  });
  it.each([
    'http://assets.example/a.png',
    '/a.png',
    'data:image/png;base64,AA==',
    'https://user:pass@assets.example/a.png',
    'https://assets.example/a.png#part',
    ' https://assets.example/a.png',
    'https://assets.example/a.png\n',
  ])('rejects invalid reference URL', (url) =>
    reject(input({ mode: 'image-edit', references: [{ url }] })),
  );
  it.each(['video/mp4', '', 'text/plain'])(
    'rejects nonimage MIME %s',
    (mimeType) =>
      reject(
        input({
          mode: 'image-edit',
          references: [{ url: 'https://assets.example/a.png', mimeType }],
        }),
      ),
  );
  it.each([
    'mask',
    'n',
    'quality',
    'output_format',
    'background',
    'moderation',
    'stream',
    'input_fidelity',
    'response_format',
    'style',
    'apiKey',
  ])('rejects unknown field %s even when undefined', (field) =>
    reject({ ...input(), [field]: undefined }),
  );
  it('rejects forged runtime structures without invoking accessors', () => {
    reject(null);
    reject({ ...input(), prompt: 5 });
    reject({ ...input(), references: undefined });
    reject({ ...input(), width: '1024', height: 1024 });
    reject([]);
    reject({ ...input(), references: new Array(1) });
    reject({
      ...input(),
      references: Object.assign([], { hiddenControl: true }),
    });
    reject(
      input({
        mode: 'image-edit',
        references: [
          { url: 'https://assets.example/a.png', [Symbol('mask')]: true },
        ],
      }),
    );
    reject({ ...input(), [Symbol('control')]: true });
    reject(Object.assign(Object.create({ model: 'gpt-image-2' }), input()));
    const value = input();
    let accessed = false;
    Object.defineProperty(value, 'prompt', {
      enumerable: true,
      get: () => {
        accessed = true;
        return 'secret';
      },
    });
    reject(value);
    expect(accessed).toBe(false);
    reject(
      input({
        mode: 'image-edit',
        references: [
          {
            url: 'https://assets.example/a.png',
            mask: true,
          } as DirectMediaInput['references'][number],
        ],
      }),
    );
  });
  it('returns only a safe category without input contents', () => {
    try {
      compileOpenAIImageRequest(
        input({ model: 'secret-token', prompt: 'private prompt' }),
      );
      expect.fail('Expected rejected input');
    } catch (error) {
      expect(error).toBeInstanceOf(DirectMediaProviderError);
      expect(error).toMatchObject({
        code: 'invalid_request',
        isSubmissionUncertain: false,
      });
      expect(String(error)).not.toContain('secret-token');
      expect(String(error)).not.toContain('private prompt');
    }
  });
});
