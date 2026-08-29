import type { ActionJsonSchema } from '../../interfaces/action-definition.interface';
import type { ActionContractSchemas } from './action-contract.interface';
import {
  arraySchema,
  BOOLEAN_SCHEMA,
  closedObjectSchema,
  enumSchema,
  INTEGER_SCHEMA,
  JSON_DOCUMENT_SCHEMA,
  NUMBER_SCHEMA,
  STRING_SCHEMA,
} from './schema-builders';

const REQUEST_PROPERTIES = {
  aspectRatio: STRING_SCHEMA,
  captionOverride: STRING_SCHEMA,
  organizationId: STRING_SCHEMA,
  personaSlug: STRING_SCHEMA,
  platforms: arraySchema(STRING_SCHEMA),
  promptOverride: STRING_SCHEMA,
} as const;
const REQUEST_REQUIRED = [
  'organizationId',
  'personaSlug',
  'platforms',
] as const;
const IMAGE_CONFIG = closedObjectSchema(
  {
    height: NUMBER_SCHEMA,
    loraPath: STRING_SCHEMA,
    prompt: STRING_SCHEMA,
    width: NUMBER_SCHEMA,
  },
  ['height', 'prompt', 'width'],
);
const GENERATION_RESULT = closedObjectSchema(
  {
    jobId: STRING_SCHEMA,
    provider: STRING_SCHEMA,
    status: enumSchema(['completed', 'queued', 'failed']),
    url: STRING_SCHEMA,
  },
  ['provider', 'status'],
);
const PLATFORM_RESULT = closedObjectSchema(
  {
    error: STRING_SCHEMA,
    externalId: STRING_SCHEMA,
    platform: STRING_SCHEMA,
    status: enumSchema(['published', 'queued', 'failed']),
    success: BOOLEAN_SCHEMA,
  },
  ['platform', 'status', 'success'],
);

function postState(
  extra: Readonly<Record<string, ActionJsonSchema>> = {},
  extraRequired: readonly string[] = [],
): ActionJsonSchema {
  return closedObjectSchema(
    {
      ...REQUEST_PROPERTIES,
      persona: JSON_DOCUMENT_SCHEMA,
      ...extra,
    },
    [...REQUEST_REQUIRED, 'persona', ...extraRequired],
  );
}

const PERSONA_STATE = postState();
const CAPTION_STATE = postState({ caption: STRING_SCHEMA }, ['caption']);
const IMAGE_PREPARED_STATE = postState(
  { caption: STRING_SCHEMA, imageConfig: IMAGE_CONFIG },
  ['caption', 'imageConfig'],
);
const IMAGE_STATE = postState(
  {
    caption: STRING_SCHEMA,
    imageConfig: IMAGE_CONFIG,
    imageUrl: STRING_SCHEMA,
  },
  ['caption', 'imageConfig', 'imageUrl'],
);
const POST_STATE = postState(
  {
    caption: STRING_SCHEMA,
    imageConfig: IMAGE_CONFIG,
    imageUrl: STRING_SCHEMA,
    ingredientId: STRING_SCHEMA,
    videoResult: GENERATION_RESULT,
    voiceResult: GENERATION_RESULT,
  },
  ['caption', 'imageConfig', 'imageUrl', 'ingredientId'],
);
const PLATFORM_ITEM = postState(
  {
    caption: STRING_SCHEMA,
    imageConfig: IMAGE_CONFIG,
    imageUrl: STRING_SCHEMA,
    ingredientId: STRING_SCHEMA,
    platform: STRING_SCHEMA,
    videoResult: GENERATION_RESULT,
    voiceResult: GENERATION_RESULT,
  },
  ['caption', 'imageConfig', 'imageUrl', 'ingredientId', 'platform'],
);
const POST_RESULT = closedObjectSchema(
  {
    caption: STRING_SCHEMA,
    imageUrl: STRING_SCHEMA,
    ingredientId: STRING_SCHEMA,
    personaSlug: STRING_SCHEMA,
    publishResults: arraySchema(PLATFORM_RESULT),
    videoResult: GENERATION_RESULT,
    voiceResult: GENERATION_RESULT,
  },
  ['caption', 'imageUrl', 'ingredientId', 'personaSlug', 'publishResults'],
);

const REQUEST_INPUT = closedObjectSchema({ request: JSON_DOCUMENT_SCHEMA }, [
  'request',
]);
const REQUEST_STATE_INPUT = closedObjectSchema(
  { request: JSON_DOCUMENT_SCHEMA, state: JSON_DOCUMENT_SCHEMA },
  ['request', 'state'],
);
const GENERATION_INPUT = closedObjectSchema({ request: POST_STATE }, [
  'request',
]);
const contract = (
  inputSchema: ActionJsonSchema,
  outputSchema: ActionJsonSchema,
): ActionContractSchemas => ({ inputSchema, outputSchema });

const CONTRACTS: Readonly<Record<string, ActionContractSchemas>> = {
  'ai-influencer.caption.generate': contract(
    REQUEST_STATE_INPUT,
    CAPTION_STATE,
  ),
  'ai-influencer.daily.discover': contract(
    { additionalProperties: false, maxProperties: 0, type: 'object' },
    closedObjectSchema(
      {
        items: arraySchema(
          closedObjectSchema(REQUEST_PROPERTIES, REQUEST_REQUIRED),
        ),
      },
      ['items'],
    ),
  ),
  'ai-influencer.daily.finalize': contract(
    closedObjectSchema({ batch: JSON_DOCUMENT_SCHEMA }, ['batch']),
    closedObjectSchema(
      { generated: INTEGER_SCHEMA, results: arraySchema(POST_RESULT) },
      ['generated', 'results'],
    ),
  ),
  'ai-influencer.daily.mark-run': contract(
    closedObjectSchema(
      { postBatch: JSON_DOCUMENT_SCHEMA, request: JSON_DOCUMENT_SCHEMA },
      ['postBatch', 'request'],
    ),
    POST_RESULT,
  ),
  'ai-influencer.daily.prepare': contract(
    REQUEST_INPUT,
    closedObjectSchema(
      {
        items: arraySchema(
          closedObjectSchema(REQUEST_PROPERTIES, REQUEST_REQUIRED),
        ),
      },
      ['items'],
    ),
  ),
  'ai-influencer.image.generate': contract(REQUEST_STATE_INPUT, IMAGE_STATE),
  'ai-influencer.image.prepare': contract(
    REQUEST_STATE_INPUT,
    IMAGE_PREPARED_STATE,
  ),
  'ai-influencer.ingredient.create': contract(REQUEST_STATE_INPUT, POST_STATE),
  'ai-influencer.persona.load': contract(REQUEST_INPUT, PERSONA_STATE),
  'ai-influencer.platform.publish': contract(
    closedObjectSchema({ request: PLATFORM_ITEM }, ['request']),
    PLATFORM_RESULT,
  ),
  'ai-influencer.post.finalize': contract(
    closedObjectSchema(
      {
        publishBatch: JSON_DOCUMENT_SCHEMA,
        request: JSON_DOCUMENT_SCHEMA,
        state: JSON_DOCUMENT_SCHEMA,
      },
      ['publishBatch', 'request', 'state'],
    ),
    POST_RESULT,
  ),
  'ai-influencer.publish.plan': contract(
    closedObjectSchema(
      {
        request: JSON_DOCUMENT_SCHEMA,
        state: JSON_DOCUMENT_SCHEMA,
        videoBatch: JSON_DOCUMENT_SCHEMA,
        voiceBatch: JSON_DOCUMENT_SCHEMA,
      },
      ['request', 'state', 'videoBatch', 'voiceBatch'],
    ),
    closedObjectSchema(
      { items: arraySchema(PLATFORM_ITEM), state: POST_STATE },
      ['items', 'state'],
    ),
  ),
  'ai-influencer.video.generate': contract(GENERATION_INPUT, GENERATION_RESULT),
  'ai-influencer.video.plan': contract(
    REQUEST_STATE_INPUT,
    closedObjectSchema(
      {
        state: POST_STATE,
        videoItems: arraySchema(POST_STATE),
        voiceItems: arraySchema(POST_STATE),
      },
      ['state', 'videoItems', 'voiceItems'],
    ),
  ),
  'ai-influencer.voice.generate': contract(GENERATION_INPUT, GENERATION_RESULT),
};

export function getAiInfluencerActionContract(
  id: string,
): ActionContractSchemas | undefined {
  return CONTRACTS[id];
}
