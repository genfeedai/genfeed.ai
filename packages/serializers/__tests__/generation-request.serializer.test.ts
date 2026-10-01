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
    ['video request', VideoGenerationSerializer],
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
