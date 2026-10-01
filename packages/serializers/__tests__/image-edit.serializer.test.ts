import {
  IMAGE_EDIT_CONTRACT_VERSION,
  MODEL_KEYS,
} from '@genfeedai/contracts/constants';
import { getDeserializer } from '@genfeedai/helpers';
import { ImageSerializer } from '@serializers/server/ingredients/image.serializer';
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
  it.each([
    ['image', ImageSerializer],
    ['ingredient', IngredientSerializer],
  ])(
    'projects the validated recipe without private provider fields on %s',
    (_name, serializer) => {
      const record = {
        id: 'edited-image',
        metadata: {
          id: 'metadata',
          providerData: {
            credentials: 'private-api-key',
            signedUrl: 'https://provider.example.com/private?signature=secret',
            imageEdit: { ...recipe, privateField: 'private-recipe-field' },
          },
        },
      };
      const output = getDeserializer(
        JSON.parse(JSON.stringify(serializer.serialize(record))),
      );
      expect(output).toMatchObject({ id: 'edited-image', imageEdit: recipe });
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
    for (const serializer of [ImageSerializer, IngredientSerializer]) {
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
});
