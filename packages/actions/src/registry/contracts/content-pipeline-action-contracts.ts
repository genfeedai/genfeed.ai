import type { ActionJsonSchema } from '../../interfaces/action-definition.interface';
import type { ActionContractSchemas } from './action-contract.interface';
import {
  arraySchema,
  BOOLEAN_SCHEMA,
  closedObjectSchema,
  enumSchema,
  NUMBER_SCHEMA,
  type ObjectSchemaProperties,
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
    // A music step without a model resolves the saved or registry default.
    type === 'text-to-speech'
      ? ['model', 'type', 'voiceId']
      : type === 'text-to-music'
        ? ['type']
        : ['model', 'type'],
  );
const ANY_STEP = {
  oneOf: [
    step('image-to-video'),
    step('text-to-image'),
    step('text-to-music'),
    step('text-to-speech'),
  ],
} as const;
const OUTCOME_PROPERTIES = {
  ingredientId: STRING_SCHEMA,
  result: STEP_RESULT,
  step: ANY_STEP,
  stepIndex: NUMBER_SCHEMA,
} as const;
const OUTCOME = closedObjectSchema(
  { ...OUTCOME_PROPERTIES, timingMs: NUMBER_SCHEMA },
  ['ingredientId', 'result', 'step', 'stepIndex', 'timingMs'],
);
/**
 * Pipeline fields arrive in a `request` envelope: persona autopilot children
 * receive their for-each item as the `request` input variable, and
 * `generateAndPublish` authors the same shape as node parameters. Edge inputs
 * (`pipelineContext`, outcomes) stay at the top level.
 */
const requestSchema = (
  properties: ObjectSchemaProperties,
  required: readonly string[],
) =>
  closedObjectSchema(
    { ...properties, idempotencyKey: STRING_SCHEMA },
    required,
  );
const generationInput = (
  type: 'image-to-video' | 'text-to-image' | 'text-to-music' | 'text-to-speech',
): ActionJsonSchema =>
  closedObjectSchema(
    {
      pipelineContext: CONTEXT,
      previousOutcome: OUTCOME,
      request: requestSchema(
        { ...BASE_PROPERTIES, step: step(type), stepIndex: NUMBER_SCHEMA },
        [...BASE_REQUIRED, 'step', 'stepIndex'],
      ),
    },
    ['pipelineContext', 'request'],
  );
// A persona child shares one request (including its step) across nodes.
const BASE_REQUEST = requestSchema(
  { ...BASE_PROPERTIES, step: ANY_STEP, stepIndex: NUMBER_SCHEMA },
  BASE_REQUIRED,
);
const PUBLISH_INPUT: ActionJsonSchema = {
  additionalProperties: false,
  patternProperties: { '^stepOutcome[0-9]+$': OUTCOME },
  properties: { pipelineContext: CONTEXT, request: BASE_REQUEST },
  required: ['pipelineContext', 'request'],
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
    inputSchema: closedObjectSchema({ request: BASE_REQUEST }, ['request']),
    outputSchema: CONTEXT,
  },
};

export function getContentPipelineActionContract(
  id: string,
): ActionContractSchemas | undefined {
  return CONTRACTS[id];
}
