import type { ActionContractSchemas } from './action-contract.interface';
import {
  closedObjectSchema,
  JSON_DOCUMENT_SCHEMA,
  STRING_SCHEMA,
} from './schema-builders';

export const REMOTION_COMPOSITION_INPUT_SCHEMA = closedObjectSchema(
  {
    accentColor: { pattern: '^#[0-9a-fA-F]{6}$', type: 'string' },
    benefits: {
      items: { maxLength: 160, minLength: 1, type: 'string' },
      maxItems: 3,
      minItems: 1,
      type: 'array',
    },
    brandId: { maxLength: 100, minLength: 1, type: 'string' },
    brandName: { maxLength: 60, minLength: 1, type: 'string' },
    callToAction: { maxLength: 80, minLength: 1, type: 'string' },
    compositionId: { enum: ['product-story'], type: 'string' },
    format: { enum: ['portrait', 'landscape', 'square'], type: 'string' },
    rendererVersion: STRING_SCHEMA,
    requestId: { maxLength: 128, minLength: 1, type: 'string' },
    sourceVideoId: { maxLength: 100, minLength: 1, type: 'string' },
    title: { maxLength: 100, minLength: 1, type: 'string' },
    version: { enum: ['1'], type: 'string' },
  },
  [
    'accentColor',
    'benefits',
    'brandId',
    'brandName',
    'callToAction',
    'compositionId',
    'format',
    'rendererVersion',
    'requestId',
    'title',
    'version',
  ],
);

const RESULT = closedObjectSchema(
  {
    assetId: STRING_SCHEMA,
    assetUrl: STRING_SCHEMA,
    compositionId: STRING_SCHEMA,
    failure: STRING_SCHEMA,
    id: STRING_SCHEMA,
    jobId: STRING_SCHEMA,
    rendererVersion: STRING_SCHEMA,
    sourceAssetIds: { items: STRING_SCHEMA, type: 'array' },
    status: STRING_SCHEMA,
    progress: { type: 'number' },
    version: STRING_SCHEMA,
  },
  [
    'id',
    'compositionId',
    'version',
    'rendererVersion',
    'sourceAssetIds',
    'status',
  ],
);

export function getRemotionActionContract(
  id: string,
): ActionContractSchemas | undefined {
  if (id === 'remotion.composition.catalog') {
    return {
      inputSchema: closedObjectSchema({}),
      outputSchema: closedObjectSchema(
        {
          compositions: {
            type: 'array',
            items: closedObjectSchema(
              {
                id: STRING_SCHEMA,
                label: STRING_SCHEMA,
                version: STRING_SCHEMA,
                rendererVersion: STRING_SCHEMA,
                inputSchema: JSON_DOCUMENT_SCHEMA,
                outputSettings: closedObjectSchema(
                  {
                    formats: { type: 'array', items: STRING_SCHEMA },
                    fps: { type: 'number' },
                    sceneDurationSeconds: { type: 'number' },
                    maxDurationSeconds: { type: 'number' },
                  },
                  [
                    'formats',
                    'fps',
                    'sceneDurationSeconds',
                    'maxDurationSeconds',
                  ],
                ),
              },
              [
                'id',
                'label',
                'version',
                'rendererVersion',
                'inputSchema',
                'outputSettings',
              ],
            ),
          },
        },
        ['compositions'],
      ),
    };
  }
  if (id === 'remotion.composition.render') {
    return {
      inputSchema: REMOTION_COMPOSITION_INPUT_SCHEMA,
      outputSchema: RESULT,
    };
  }
  if (
    [
      'remotion.composition.status',
      'remotion.composition.cancel',
      'remotion.composition.retry',
    ].includes(id)
  ) {
    return {
      inputSchema: closedObjectSchema({ projectId: STRING_SCHEMA }, [
        'projectId',
      ]),
      outputSchema: RESULT,
    };
  }
  return undefined;
}
