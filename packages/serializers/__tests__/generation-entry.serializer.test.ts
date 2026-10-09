import {
  AvatarSerializer,
  ImageSerializer,
  IngredientSerializer,
  MusicSerializer,
  VideoSerializer,
  VoiceSerializer,
} from '@serializers/index';
import { describe, expect, it } from 'vitest';

describe('generation entry serializers', () => {
  it.each([
    ['ingredient', IngredientSerializer],
    ['image', ImageSerializer],
    ['video', VideoSerializer],
    ['music', MusicSerializer],
    ['avatar', AvatarSerializer],
    ['voice', VoiceSerializer],
  ])('projects entry metadata on %s', (_name, serializer) => {
    const result = serializer.serialize({
      id: 'asset',
      providerData: {
        generationEntry: {
          channel: 'mcp',
          attribution: 'server_verified',
          credential: 'entry-secret',
        },
      },
    });
    expect(result).toMatchObject({
      data: {
        attributes: {
          generationEntry: { channel: 'mcp', attribution: 'server_verified' },
        },
      },
    });
    expect(JSON.stringify(result)).not.toContain('entry-secret');
  });
  it('does not invent an entry for historical assets', () => {
    const result = IngredientSerializer.serialize({
      id: 'historical',
      providerData: { model: 'existing' },
    });
    expect(result).not.toHaveProperty('data.attributes.generationEntry');
  });
});
