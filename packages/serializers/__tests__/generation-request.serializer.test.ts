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
