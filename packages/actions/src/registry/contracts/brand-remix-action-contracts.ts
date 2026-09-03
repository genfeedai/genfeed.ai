import type { ActionJsonSchema } from '../../interfaces/action-definition.interface';
import type { ActionContractSchemas } from './action-contract.interface';
import {
  arraySchema,
  BOOLEAN_SCHEMA,
  closedObjectSchema,
  INTEGER_SCHEMA,
  JSON_DOCUMENT_SCHEMA,
  STRING_SCHEMA,
} from './schema-builders';

const REQUEST_INPUT = closedObjectSchema({ request: JSON_DOCUMENT_SCHEMA }, [
  'request',
]);
const STATE_INPUT = closedObjectSchema({ state: JSON_DOCUMENT_SCHEMA }, [
  'state',
]);
const contract = (
  inputSchema: ActionJsonSchema,
  outputSchema: ActionJsonSchema,
): ActionContractSchemas => ({ inputSchema, outputSchema });
const state = (
  properties: Readonly<Record<string, ActionJsonSchema>>,
  optional: readonly string[] = [],
): ActionJsonSchema =>
  closedObjectSchema(
    properties,
    Object.keys(properties).filter((field) => !optional.includes(field)),
  );

const PAID_RESULT = state({
  adAccountId: STRING_SCHEMA,
  adId: STRING_SCHEMA,
  adSetId: STRING_SCHEMA,
  campaignId: STRING_SCHEMA,
  credentialId: STRING_SCHEMA,
  ingredientId: STRING_SCHEMA,
  postId: STRING_SCHEMA,
  recipeRevision: INTEGER_SCHEMA,
  recipeVersion: { const: 1, type: 'integer' },
  replayed: BOOLEAN_SCHEMA,
  status: { const: 'PAUSED', type: 'string' },
  variantId: STRING_SCHEMA,
  workflowExecutionId: STRING_SCHEMA,
  workflowId: STRING_SCHEMA,
});

const META_BASE = {
  adName: STRING_SCHEMA,
  adSetName: STRING_SCHEMA,
  campaignName: STRING_SCHEMA,
  category: STRING_SCHEMA,
  ingredientId: STRING_SCHEMA,
  input: JSON_DOCUMENT_SCHEMA,
  mediaUrl: STRING_SCHEMA,
  postId: STRING_SCHEMA,
  replayed: BOOLEAN_SCHEMA,
} as const;
const META_ACCOUNT = {
  ...META_BASE,
  adAccountId: STRING_SCHEMA,
  pageId: STRING_SCHEMA,
} as const;
const META_CAMPAIGN = { ...META_ACCOUNT, campaignId: STRING_SCHEMA } as const;
const META_AD_SET = { ...META_CAMPAIGN, adSetId: STRING_SCHEMA } as const;
const META_FOUND = {
  ...META_AD_SET,
  adId: STRING_SCHEMA,
  hasExistingAd: BOOLEAN_SCHEMA,
} as const;
const META_CREATIVE: ActionJsonSchema = {
  oneOf: [
    closedObjectSchema({ imageHash: STRING_SCHEMA }, ['imageHash']),
    closedObjectSchema(
      { thumbnailUrl: STRING_SCHEMA, videoId: STRING_SCHEMA },
      ['thumbnailUrl', 'videoId'],
    ),
  ],
};
const META_PREPARED = { ...META_FOUND, creative: META_CREATIVE } as const;

const X_BASE = {
  campaignName: STRING_SCHEMA,
  ingredientId: STRING_SCHEMA,
  input: JSON_DOCUMENT_SCHEMA,
  lineItemName: STRING_SCHEMA,
  postId: STRING_SCHEMA,
  replayed: BOOLEAN_SCHEMA,
} as const;
const X_ACCOUNT = { ...X_BASE, adAccountId: STRING_SCHEMA } as const;
const X_FUNDED = {
  ...X_ACCOUNT,
  fundingInstrumentId: STRING_SCHEMA,
} as const;
const X_CAMPAIGN = { ...X_FUNDED, campaignId: STRING_SCHEMA } as const;
const X_LINE_ITEM = { ...X_CAMPAIGN, lineItemId: STRING_SCHEMA } as const;
const X_PROMOTED = {
  ...X_LINE_ITEM,
  promotedTweetId: STRING_SCHEMA,
} as const;

const EXECUTE_STATE = {
  avatarByokBypass: BOOLEAN_SCHEMA,
  brandContext: JSON_DOCUMENT_SCHEMA,
  brandId: STRING_SCHEMA,
  config: JSON_DOCUMENT_SCHEMA,
  hasWork: BOOLEAN_SCHEMA,
  isCopy: BOOLEAN_SCHEMA,
  items: arraySchema(JSON_DOCUMENT_SCHEMA),
  organizationId: STRING_SCHEMA,
  recipeRevision: INTEGER_SCHEMA,
  run: JSON_DOCUMENT_SCHEMA,
  runId: STRING_SCHEMA,
  view: JSON_DOCUMENT_SCHEMA,
} as const;
const EXECUTE_STATE_OPTIONAL = ['view'] as const;

const REVIEW_PREPARED = {
  brandContext: JSON_DOCUMENT_SCHEMA,
  brandId: STRING_SCHEMA,
  config: JSON_DOCUMENT_SCHEMA,
  needsHandoff: BOOLEAN_SCHEMA,
  organizationId: STRING_SCHEMA,
  recordTrendLineage: BOOLEAN_SCHEMA,
  run: JSON_DOCUMENT_SCHEMA,
  runId: STRING_SCHEMA,
  selected: arraySchema(JSON_DOCUMENT_SCHEMA),
  selectedAssetIds: arraySchema(STRING_SCHEMA),
  userId: STRING_SCHEMA,
} as const;
const REVIEW_CLAIMED = {
  ...REVIEW_PREPARED,
  claimedConfig: JSON_DOCUMENT_SCHEMA,
  claimedRun: JSON_DOCUMENT_SCHEMA,
} as const;
const REVIEW_HANDOFF = {
  ...REVIEW_CLAIMED,
  completed: state({
    batchId: STRING_SCHEMA,
    postIds: arraySchema(STRING_SCHEMA),
    workflowExecutionId: STRING_SCHEMA,
    workflowId: STRING_SCHEMA,
  }),
} as const;

const CONTRACTS: Readonly<Record<string, ActionContractSchemas>> = {
  'brand-remix.execute.adopt-orphans': contract(
    STATE_INPUT,
    state(EXECUTE_STATE, EXECUTE_STATE_OPTIONAL),
  ),
  'brand-remix.execute.claim': contract(
    STATE_INPUT,
    state(EXECUTE_STATE, EXECUTE_STATE_OPTIONAL),
  ),
  'brand-remix.execute.dispatch-media': contract(
    STATE_INPUT,
    state(EXECUTE_STATE, EXECUTE_STATE_OPTIONAL),
  ),
  'brand-remix.execute.generate-copy': contract(
    STATE_INPUT,
    state(EXECUTE_STATE, EXECUTE_STATE_OPTIONAL),
  ),
  'brand-remix.execute.prepare': contract(
    REQUEST_INPUT,
    state(EXECUTE_STATE, [...EXECUTE_STATE_OPTIONAL, 'hasWork', 'isCopy']),
  ),
  'brand-remix.execute.project': contract(
    STATE_INPUT,
    state(
      {
        brand: JSON_DOCUMENT_SCHEMA,
        brandId: STRING_SCHEMA,
        contract: STRING_SCHEMA,
        createdAt: STRING_SCHEMA,
        draft: JSON_DOCUMENT_SCHEMA,
        execution: JSON_DOCUMENT_SCHEMA,
        generationClaim: JSON_DOCUMENT_SCHEMA,
        id: STRING_SCHEMA,
        paidDraft: JSON_DOCUMENT_SCHEMA,
        paidDraftOperation: JSON_DOCUMENT_SCHEMA,
        phase: STRING_SCHEMA,
        readiness: JSON_DOCUMENT_SCHEMA,
        recipeVersion: { const: 1, type: 'integer' },
        review: JSON_DOCUMENT_SCHEMA,
        reviewClaim: JSON_DOCUMENT_SCHEMA,
        source: JSON_DOCUMENT_SCHEMA,
        sourceSnapshot: JSON_DOCUMENT_SCHEMA,
        status: STRING_SCHEMA,
        updatedAt: STRING_SCHEMA,
        version: { const: 1, type: 'integer' },
      },
      [
        'execution',
        'generationClaim',
        'paidDraft',
        'paidDraftOperation',
        'review',
        'reviewClaim',
        'source',
      ],
    ),
  ),
  'brand-remix.execute.reconcile': contract(
    STATE_INPUT,
    state(EXECUTE_STATE, EXECUTE_STATE_OPTIONAL),
  ),
  'brand-remix.meta.create-ad': contract(STATE_INPUT, state(META_PREPARED)),
  'brand-remix.meta.ensure-ad-set': contract(STATE_INPUT, state(META_AD_SET)),
  'brand-remix.meta.ensure-campaign': contract(
    STATE_INPUT,
    state(META_CAMPAIGN),
  ),
  'brand-remix.meta.find-ad': contract(
    STATE_INPUT,
    state(META_FOUND, ['adId']),
  ),
  'brand-remix.meta.pause-ad': contract(
    STATE_INPUT,
    state(META_PREPARED, ['creative']),
  ),
  'brand-remix.meta.pause-ad-set': contract(
    STATE_INPUT,
    state(META_PREPARED, ['creative']),
  ),
  'brand-remix.meta.pause-campaign': contract(
    STATE_INPUT,
    state(META_PREPARED, ['creative']),
  ),
  'brand-remix.meta.persist-lineage': contract(STATE_INPUT, PAID_RESULT),
  'brand-remix.meta.persist-mapping': contract(
    STATE_INPUT,
    state(
      {
        ...META_PREPARED,
        result: PAID_RESULT,
        workflowLabel: STRING_SCHEMA,
      },
      ['creative'],
    ),
  ),
  'brand-remix.meta.prepare-creative': contract(
    STATE_INPUT,
    state(META_PREPARED, ['adId']),
  ),
  'brand-remix.meta.resolve-account': contract(
    STATE_INPUT,
    state(META_ACCOUNT),
  ),
  'brand-remix.meta.validate-source': contract(REQUEST_INPUT, state(META_BASE)),
  'brand-remix.review.claim': contract(STATE_INPUT, state(REVIEW_CLAIMED)),
  'brand-remix.review.complete': contract(
    STATE_INPUT,
    state({
      brandContext: JSON_DOCUMENT_SCHEMA,
      config: JSON_DOCUMENT_SCHEMA,
      run: JSON_DOCUMENT_SCHEMA,
    }),
  ),
  'brand-remix.review.create-handoff': contract(
    STATE_INPUT,
    state(REVIEW_HANDOFF),
  ),
  'brand-remix.review.prepare': contract(REQUEST_INPUT, state(REVIEW_PREPARED)),
  'brand-remix.review.project': contract(
    STATE_INPUT,
    state(
      {
        brand: JSON_DOCUMENT_SCHEMA,
        brandId: STRING_SCHEMA,
        contract: STRING_SCHEMA,
        createdAt: STRING_SCHEMA,
        draft: JSON_DOCUMENT_SCHEMA,
        execution: JSON_DOCUMENT_SCHEMA,
        generationClaim: JSON_DOCUMENT_SCHEMA,
        id: STRING_SCHEMA,
        paidDraft: JSON_DOCUMENT_SCHEMA,
        paidDraftOperation: JSON_DOCUMENT_SCHEMA,
        phase: STRING_SCHEMA,
        readiness: JSON_DOCUMENT_SCHEMA,
        recipeVersion: { const: 1, type: 'integer' },
        review: JSON_DOCUMENT_SCHEMA,
        reviewClaim: JSON_DOCUMENT_SCHEMA,
        source: JSON_DOCUMENT_SCHEMA,
        sourceSnapshot: JSON_DOCUMENT_SCHEMA,
        status: STRING_SCHEMA,
        updatedAt: STRING_SCHEMA,
        version: { const: 1, type: 'integer' },
      },
      [
        'execution',
        'generationClaim',
        'paidDraft',
        'paidDraftOperation',
        'review',
        'reviewClaim',
        'source',
      ],
    ),
  ),
  'brand-remix.review.record-lineage': contract(
    STATE_INPUT,
    state(REVIEW_HANDOFF),
  ),
  'brand-remix.x.ensure-campaign': contract(STATE_INPUT, state(X_CAMPAIGN)),
  'brand-remix.x.ensure-line-item': contract(STATE_INPUT, state(X_LINE_ITEM)),
  'brand-remix.x.ensure-promoted-tweet': contract(
    STATE_INPUT,
    state(X_PROMOTED),
  ),
  'brand-remix.x.persist-lineage': contract(STATE_INPUT, PAID_RESULT),
  'brand-remix.x.persist-mapping': contract(
    STATE_INPUT,
    state({
      ...X_PROMOTED,
      result: PAID_RESULT,
      workflowLabel: STRING_SCHEMA,
    }),
  ),
  'brand-remix.x.resolve-account': contract(STATE_INPUT, state(X_ACCOUNT)),
  'brand-remix.x.resolve-funding': contract(STATE_INPUT, state(X_FUNDED)),
  'brand-remix.x.validate-source': contract(REQUEST_INPUT, state(X_BASE)),
  'brand-remix.x.validate-tweet': contract(STATE_INPUT, state(X_FUNDED)),
};

export function getBrandRemixActionContract(
  id: string,
): ActionContractSchemas | undefined {
  return CONTRACTS[id];
}
