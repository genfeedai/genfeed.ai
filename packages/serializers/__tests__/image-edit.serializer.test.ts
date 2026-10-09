import {
  IMAGE_EDIT_CONTRACT_VERSION,
  MODEL_KEYS,
} from '@genfeedai/contracts/constants';
import { getDeserializer } from '@genfeedai/helpers';
import {
  ImageEditingRequestSerializer,
  ImageGenerationSerializer,
  ImageSerializer,
} from '@serializers/server/ingredients/image.serializer';
import { IngredientSerializer } from '@serializers/server/ingredients/ingredient.serializer';
import { describe, expect, it } from 'vitest';

const recipe = {
  operation: 'image-edit',
  contractVersion: IMAGE_EDIT_CONTRACT_VERSION,
  model: MODEL_KEYS.REPLICATE_IDEOGRAM_AI_IDEOGRAM_4_5,
  sourceIds: ['owned-source'],
  size: 'source',
  quality: 'medium',
  outputs: 1,
};

describe('image editing public serializer projection', () => {
  it('preserves Auto priority and editing controls on the actual wire request', () => {
    const wire = ImageEditingRequestSerializer.serialize({
      prompt: 'Edit',
      autoSelectModel: true,
      prioritize: 'cost',
      seed: 0,
      maskId: 'mask',
      outputs: 2,
    });
    expect(getDeserializer(JSON.parse(JSON.stringify(wire)))).toMatchObject({
      autoSelectModel: true,
      prioritize: 'cost',
      seed: 0,
      maskId: 'mask',
      outputs: 2,
    });
  });
  it.each([
    ['image', ImageSerializer],
    ['image generation', ImageGenerationSerializer],
    ['ingredient', IngredientSerializer],
  ])(
    'projects the validated recipe without private provider fields on %s',
    (_name, serializer) => {
      const record = {
        id: 'edited-image',
        width: 1024,
        height: 768,
        metadata: {
          id: 'metadata',
          label: 'Edited cover',
          description: 'Public image description',
          model: MODEL_KEYS.REPLICATE_IDEOGRAM_AI_IDEOGRAM_4_5,
          width: 1024,
          height: 768,
          extension: 'png',
          size: 12345,
          signedUrl:
            'https://provider.example.com/private?signature=metadata-secret',
          providerData: {
            credentials: 'private-api-key',
            signedUrl: 'https://provider.example.com/private?signature=secret',
            imageEdit: { ...recipe, privateField: 'private-recipe-field' },
          },
        },
      };
      const serialized = serializer.serialize(record);
      const wire = JSON.stringify(serialized);
      const output = getDeserializer(JSON.parse(wire));
      expect(serialized).toMatchObject({
        data: { type: _name === 'ingredient' ? 'ingredient' : 'image' },
      });
      expect(output).toMatchObject({
        id: 'edited-image',
        width: 1024,
        height: 768,
        imageEdit: recipe,
        metadata: {
          id: 'metadata',
          label: 'Edited cover',
          description: 'Public image description',
          model: MODEL_KEYS.REPLICATE_IDEOGRAM_AI_IDEOGRAM_4_5,
          width: 1024,
          height: 768,
          extension: 'png',
          size: 12345,
        },
      });
      expect(wire).not.toContain('private-api-key');
      expect(wire).not.toContain('signature=');
      expect(wire).not.toContain('private-recipe-field');
      expect(wire).not.toContain('providerData');
      expect(record.metadata.providerData.credentials).toBe('private-api-key');
      expect(JSON.stringify(output)).not.toContain('private-api-key');
      expect(JSON.stringify(output)).not.toContain('signature=secret');
      expect(JSON.stringify(output)).not.toContain('private-recipe-field');
      expect(output).not.toHaveProperty('imageEdit.privateField');
      expect(output).not.toHaveProperty('metadata.providerData');
    },
  );
  it.each([
    undefined,
    null,
    {},
    { ...recipe, model: 'unsupported' },
    { ...recipe, sourceIds: [] },
  ])('omits absent, malformed or unsupported recipes: %j', (imageEdit) => {
    for (const serializer of [
      ImageSerializer,
      ImageGenerationSerializer,
      ImageEditingRequestSerializer,
      IngredientSerializer,
    ]) {
      const output = getDeserializer(
        JSON.parse(
          JSON.stringify(
            serializer.serialize({
              id: 'edited-image',
              metadata: { id: 'metadata', providerData: { imageEdit } },
            }),
          ),
        ),
      );
      expect(output).not.toHaveProperty('imageEdit');
    }
  });
  it('preserves image-only attributes and generation request fields alongside public metadata', () => {
    const record = {
      id: 'generated-image',
      seed: 42,
      resolution: '1K',
      aspectRatio: '4:3',
      outputFormat: 'png',
      fontFamily: 'Inter',
      harness: true,
      knowledge: { sourceIds: ['source-1'] },
      requestedSkillSlugs: ['cinema'],
      metadata: {
        id: 'generated-metadata',
        label: 'Generated cover',
        width: 1024,
        height: 768,
        providerData: {
          credentials: 'generation-private-key',
          signedUrl: 'https://provider.example.com/image?signature=private',
          imageEdit: recipe,
        },
      },
    };
    for (const serializer of [ImageSerializer, ImageGenerationSerializer]) {
      const wire = JSON.stringify(serializer.serialize(record));
      const output = getDeserializer(JSON.parse(wire));
      expect(output).toMatchObject({
        id: 'generated-image',
        seed: 42,
        resolution: '1K',
        outputFormat: 'png',
        fontFamily: 'Inter',
        imageEdit: recipe,
        metadata: {
          id: 'generated-metadata',
          label: 'Generated cover',
          width: 1024,
          height: 768,
        },
      });
      expect(wire).not.toContain('generation-private-key');
      expect(wire).not.toContain('signature=private');
      expect(wire).not.toContain('providerData');
      if (serializer === ImageGenerationSerializer) {
        expect(output).toMatchObject({
          aspectRatio: '4:3',
          harness: true,
          knowledge: { sourceIds: ['source-1'] },
          requestedSkillSlugs: ['cinema'],
        });
      } else {
        expect(output).not.toHaveProperty('harness');
        expect(output).not.toHaveProperty('knowledge');
        expect(output).not.toHaveProperty('requestedSkillSlugs');
      }
    }
  });
});
