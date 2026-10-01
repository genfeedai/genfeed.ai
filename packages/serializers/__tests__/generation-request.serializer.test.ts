import {
  ImageGenerationSerializer,
  ImageSerializer,
} from '@serializers/server/ingredients/image.serializer';
import {
  VideoGenerationSerializer,
  VideoSerializer,
} from '@serializers/server/ingredients/video.serializer';
import { describe, expect, it } from 'vitest';

const REQUEST = {
  harness: true,
  knowledge: { sourceIds: ['source-1'] },
  requestedSkillSlugs: ['cinema'],
  text: 'A teal heron poster',
};

describe('generation request serializers', () => {
  it.each([
    ['image', ImageGenerationSerializer],
    ['video', VideoGenerationSerializer],
  ] as const)('keep the %s request-only fields', (_kind, serializer) => {
    const serialized = serializer.serialize(REQUEST) as {
      data: { attributes: Record<string, unknown> };
    };

    expect(serialized.data.attributes).toMatchObject(REQUEST);
  });

  it.each([
    ['image', ImageSerializer],
    ['video', VideoSerializer],
  ] as const)(
    'keep request-only fields out of %s responses',
    (_kind, serializer) => {
      const serialized = serializer.serialize(REQUEST) as {
        data: { attributes: Record<string, unknown> };
      };

      expect(serialized.data.attributes).not.toHaveProperty('knowledge');
      expect(serialized.data.attributes).not.toHaveProperty('harness');
    },
  );
});

describe('Crun canonical consume attributes', () => {
  const request = {
    model: 'crun/google/nano-banana-pro',
    text: 'Ceramic bird',
    brandId: 'brand-1',
    folderId: 'folder-1',
    outputs: 4,
    references: ['owned-1'],
    crunQuoteId: 'opaque-token',
    crunControls: {
      contractVersion: 'reviewed',
      aspectRatio: '21:9',
      resolution: '4K',
      outputFormat: 'jpg',
    },
    harness: false,
  };
  it('retains the exact quote intent on image requests', () => {
    const document = ImageGenerationSerializer.serialize(request) as {
      data: { attributes: Record<string, unknown> };
    };
    expect(document.data.attributes).toMatchObject(request);
  });
  it.each([
    ['image response', ImageSerializer],
    ['video response', VideoSerializer],
  ] as const)(
    'excludes Crun-only authorization fields from %s',
    (_surface, serializer) => {
      const document = serializer.serialize(request) as {
        data: { attributes: Record<string, unknown> };
      };
      for (const field of ['crunControls', 'crunQuoteId'])
        expect(document.data.attributes).not.toHaveProperty(field);
    },
  );
});

describe('canonical Crun video consume', () => {
  const request = {
    model: 'crun/kling/v2-5-turbo-pro',
    text: 'Camera moves',
    brandId: 'brand-1',
    folderId: 'folder-1',
    promptId: 'prompt-1',
    parentId: 'start-1',
    references: ['start-1'],
    endFrame: 'end-1',
    outputs: 4,
    crunQuoteId: 'video-quote',
    crunControls: {
      contractVersion: 'video-reviewed',
      duration: 10,
      guidanceScale: 0,
      negativePrompt: 'no blur',
    },
    harness: false,
    requestedSkillSlugs: [],
    knowledge: { sourceIds: [] },
    style: 'cinema',
    mood: 'calm',
    camera: 'dolly',
    lens: 'wide',
    scene: 'coast',
    lighting: 'daylight',
    fontFamily: 'serif',
    blacklist: ['blur'],
    brandingMode: 'off',
    isBrandingEnabled: false,
    promptTemplate: 'video-template',
    useTemplate: true,
  };
  it('retains every canonical context field without generic dimensions', () => {
    const document = VideoGenerationSerializer.serialize(request) as {
      data: { attributes: Record<string, unknown> };
    };
    expect(document.data.attributes).toMatchObject(request);
    for (const name of ['width', 'height', 'sounds', 'isAudioEnabled'])
      expect(document.data.attributes).not.toHaveProperty(name);
  });
  it('retains nested false and zero without string conversion', () => {
    const document = VideoGenerationSerializer.serialize({
      ...request,
      model: 'crun/google/veo3-1-fast-t2v',
      crunControls: {
        contractVersion: 'video-reviewed',
        duration: 8,
        resolution: '4k',
        aspectRatio: '9:16',
        translatePrompt: false,
        guidanceScale: 0,
      },
    }) as { data: { attributes: Record<string, unknown> } };
    expect(document.data.attributes.crunControls).toEqual({
      contractVersion: 'video-reviewed',
      duration: 8,
      resolution: '4k',
      aspectRatio: '9:16',
      translatePrompt: false,
      guidanceScale: 0,
    });
  });
  it('keeps quote authorization and private fields out of public video responses', () => {
    const document = VideoSerializer.serialize({
      ...request,
      providerKey: 'private',
      vendorRates: [42],
    }) as { data: { attributes: Record<string, unknown> } };
    for (const name of [
      'crunQuoteId',
      'crunControls',
      'providerKey',
      'vendorRates',
      'knowledge',
      'harness',
    ])
      expect(document.data.attributes).not.toHaveProperty(name);
  });
});
