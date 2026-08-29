import type { ActionJsonSchema } from '../../interfaces/action-definition.interface';
import type { ActionContractSchemas } from './action-contract.interface';
import {
  arraySchema,
  BOOLEAN_SCHEMA,
  closedObjectSchema,
  enumSchema,
  NUMBER_SCHEMA,
  STRING_SCHEMA,
} from './schema-builders';

const REFERENCE = closedObjectSchema(
  {
    assetId: STRING_SCHEMA,
    description: STRING_SCHEMA,
    role: enumSchema([
      'character',
      'composition',
      'first_frame',
      'last_frame',
      'product',
      'reference_video',
      'style',
      'subject',
    ] as const),
  },
  ['assetId', 'role'],
);
const BASE_PROPERTIES = {
  brandId: STRING_SCHEMA,
  organizationId: STRING_SCHEMA,
  personaId: STRING_SCHEMA,
  platforms: arraySchema(STRING_SCHEMA),
  prompt: STRING_SCHEMA,
  publishMode: enumSchema(['all', 'final', 'none'] as const),
  runReferences: arraySchema(REFERENCE),
  scheduledDate: STRING_SCHEMA,
  userId: STRING_SCHEMA,
} as const;
const BASE_REQUIRED = [
  'brandId',
  'organizationId',
  'personaId',
  'publishMode',
  'userId',
] as const;
const CONTEXT = closedObjectSchema(
  { hasCredentials: BOOLEAN_SCHEMA, runReferences: arraySchema(REFERENCE) },
  ['hasCredentials'],
);
const STEP_RESULT = closedObjectSchema(
  { contentType: STRING_SCHEMA, url: STRING_SCHEMA },
  ['contentType', 'url'],
);
const step = (
  type: 'image-to-video' | 'text-to-image' | 'text-to-music' | 'text-to-speech',
) =>
  closedObjectSchema(
    {
      aspectRatio: STRING_SCHEMA,
      duration: NUMBER_SCHEMA,
      imageUrl: STRING_SCHEMA,
      model: STRING_SCHEMA,
      prompt: STRING_SCHEMA,
      text: STRING_SCHEMA,
      type: enumSchema([type] as const),
      voiceId: STRING_SCHEMA,
    },
    type === 'text-to-speech'
      ? ['model', 'type', 'voiceId']
      : ['model', 'type'],
  );
const OUTCOME_PROPERTIES = {
  ingredientId: STRING_SCHEMA,
  result: STEP_RESULT,
  step: {
    oneOf: [
      step('image-to-video'),
      step('text-to-image'),
      step('text-to-music'),
      step('text-to-speech'),
    ],
  },
  stepIndex: NUMBER_SCHEMA,
} as const;
const OUTCOME = closedObjectSchema(
  { ...OUTCOME_PROPERTIES, timingMs: NUMBER_SCHEMA },
  ['ingredientId', 'result', 'step', 'stepIndex', 'timingMs'],
);
const generationInput = (
  type: 'image-to-video' | 'text-to-image' | 'text-to-music' | 'text-to-speech',
): ActionJsonSchema =>
  closedObjectSchema(
    {
      ...BASE_PROPERTIES,
      pipelineContext: CONTEXT,
      previousOutcome: OUTCOME,
      step: step(type),
      stepIndex: NUMBER_SCHEMA,
    },
    [...BASE_REQUIRED, 'pipelineContext', 'step', 'stepIndex'],
  );
const PUBLISH_INPUT: ActionJsonSchema = {
  additionalProperties: false,
  patternProperties: { '^stepOutcome[0-9]+$': OUTCOME },
  properties: { ...BASE_PROPERTIES, pipelineContext: CONTEXT },
  required: [...BASE_REQUIRED, 'pipelineContext'],
  type: 'object',
};
const FINAL_OUTCOME = closedObjectSchema(OUTCOME_PROPERTIES, [
  'ingredientId',
  'result',
  'step',
  'stepIndex',
]);

const CONTRACTS: Readonly<Record<string, ActionContractSchemas>> = {
  'content.pipeline.generate-image': {
    inputSchema: generationInput('text-to-image'),
    outputSchema: OUTCOME,
  },
  'content.pipeline.generate-music': {
    inputSchema: generationInput('text-to-music'),
    outputSchema: OUTCOME,
  },
  'content.pipeline.generate-speech': {
    inputSchema: generationInput('text-to-speech'),
    outputSchema: OUTCOME,
  },
  'content.pipeline.generate-video': {
    inputSchema: generationInput('image-to-video'),
    outputSchema: OUTCOME,
  },
  'content.pipeline.publish': {
    inputSchema: PUBLISH_INPUT,
    outputSchema: closedObjectSchema(
      {
        postIds: arraySchema(STRING_SCHEMA),
        status: enumSchema(['completed'] as const),
        steps: arraySchema(FINAL_OUTCOME),
        timings: closedObjectSchema(
          { stepTimingsMs: arraySchema(NUMBER_SCHEMA), totalMs: NUMBER_SCHEMA },
          ['stepTimingsMs', 'totalMs'],
        ),
      },
      ['postIds', 'status', 'steps', 'timings'],
    ),
  },
  'content.pipeline.resolve-context': {
    inputSchema: closedObjectSchema(BASE_PROPERTIES, BASE_REQUIRED),
    outputSchema: CONTEXT,
  },
};

export function getContentPipelineActionContract(
  id: string,
): ActionContractSchemas | undefined {
  return CONTRACTS[id];
}
