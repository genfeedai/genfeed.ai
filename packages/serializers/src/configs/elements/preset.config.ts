import { presetAttributes } from '@serializers/attributes/elements/preset.attributes';
import { simpleConfig } from '@serializers/builders';

export const presetSerializerConfig = {
  ...simpleConfig('preset', presetAttributes),
  // Persisted preset details live in Prisma's config JSON. Scope, identity
  // and activation always come from scalar columns, never that JSON.
  attributeDerivations: Object.fromEntries(
    [
      'label',
      'description',
      'prompt',
      'key',
      'model',
      'provider',
      'platform',
      'camera',
      'aspectRatio',
      'duration',
      'promptTemplate',
      'lighting',
      'lens',
      'cameraMovement',
      'mood',
      'scene',
      'style',
      'blacklists',
      'ingredientId',
    ].map((field) => [
      field,
      (record: Record<string, unknown>): unknown => {
        const config = record.config;
        return (
          record[field] ??
          (config && typeof config === 'object' && !Array.isArray(config)
            ? (config as Record<string, unknown>)[field]
            : undefined)
        );
      },
    ]),
  ),
};
