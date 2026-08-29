import type { ActionJsonSchema } from '../../interfaces/action-definition.interface.js';
import type { ActionContractSchemas } from './action-contract.interface.js';
import {
  arraySchema,
  BOOLEAN_SCHEMA,
  closedObjectSchema,
  enumSchema,
  INTEGER_SCHEMA,
  JSON_DOCUMENT_SCHEMA,
  NUMBER_SCHEMA,
  nullableSchema,
  STRING_SCHEMA,
} from './schema-builders.js';

const REQUEST = closedObjectSchema(
  {
    campaignId: STRING_SCHEMA,
    organizationId: STRING_SCHEMA,
    scheduledAt: STRING_SCHEMA,
    userId: STRING_SCHEMA,
  },
  ['campaignId', 'organizationId', 'userId'],
);
const EMPTY_INPUT = closedObjectSchema({});
const requestInput = (
  additions: Readonly<Record<string, ActionJsonSchema>> = {},
  required: readonly string[] = [],
) =>
  closedObjectSchema({ request: REQUEST, ...additions }, [
    'request',
    ...required,
  ]);

const DISPATCH_PLAN = closedObjectSchema(
  {
    agentType: STRING_SCHEMA,
    objective: STRING_SCHEMA,
    reason: STRING_SCHEMA,
    runId: STRING_SCHEMA,
    strategyId: STRING_SCHEMA,
  },
  ['agentType', 'objective', 'reason', 'runId', 'strategyId'],
);
const NULLABLE_STRING = nullableSchema(STRING_SCHEMA);
const CAMPAIGN_DISPATCH_ITEM = closedObjectSchema(
  {
    campaign: JSON_DOCUMENT_SCHEMA,
    creditBudget: NUMBER_SCHEMA,
    objective: STRING_SCHEMA,
    organizationId: STRING_SCHEMA,
    reason: STRING_SCHEMA,
    rotationSelection: JSON_DOCUMENT_SCHEMA,
    strategy: JSON_DOCUMENT_SCHEMA,
    userId: STRING_SCHEMA,
  },
  ['campaign', 'objective', 'organizationId', 'reason', 'strategy', 'userId'],
);
const ORCHESTRATION_ANNOTATION_ITEM = closedObjectSchema(
  {
    organizationId: STRING_SCHEMA,
    plan: DISPATCH_PLAN,
    rotationSelection: JSON_DOCUMENT_SCHEMA,
    summary: STRING_SCHEMA,
  },
  ['organizationId', 'plan', 'summary'],
);
const ORCHESTRATION_STATE_PROPERTIES = {
  analyticsOverview: JSON_DOCUMENT_SCHEMA,
  campaign: JSON_DOCUMENT_SCHEMA,
  completeCampaign: BOOLEAN_SCHEMA,
  dispatchedRuns: arraySchema(DISPATCH_PLAN),
  goalSummaries: arraySchema(STRING_SCHEMA),
  items: arraySchema(JSON_DOCUMENT_SCHEMA),
  memoryCaptured: BOOLEAN_SCHEMA,
  nextOrchestratedAt: NULLABLE_STRING,
  organizationId: STRING_SCHEMA,
  perStrategyBudget: nullableSchema(NUMBER_SCHEMA),
  rotationSelection: JSON_DOCUMENT_SCHEMA,
  selectedStrategies: arraySchema(JSON_DOCUMENT_SCHEMA),
  skippedReason: STRING_SCHEMA,
  summary: STRING_SCHEMA,
} as const;
const ORCHESTRATION_STATE_REQUIRED = [
  'analyticsOverview',
  'campaign',
  'goalSummaries',
  'organizationId',
  'perStrategyBudget',
  'selectedStrategies',
] as const;
const ORCHESTRATION_STATE = closedObjectSchema(
  ORCHESTRATION_STATE_PROPERTIES,
  ORCHESTRATION_STATE_REQUIRED,
);
const PLANNED_ORCHESTRATION_STATE = closedObjectSchema(
  ORCHESTRATION_STATE_PROPERTIES,
  [...ORCHESTRATION_STATE_REQUIRED, 'items'],
);
const SUMMARIZED_ORCHESTRATION_STATE = closedObjectSchema(
  {
    ...ORCHESTRATION_STATE_PROPERTIES,
    annotationItems: arraySchema(JSON_DOCUMENT_SCHEMA),
  },
  [
    ...ORCHESTRATION_STATE_REQUIRED,
    'annotationItems',
    'dispatchedRuns',
    'nextOrchestratedAt',
    'summary',
  ],
);
const CAPTURED_ORCHESTRATION_STATE = closedObjectSchema(
  {
    ...ORCHESTRATION_STATE_PROPERTIES,
    annotationItems: arraySchema(JSON_DOCUMENT_SCHEMA),
  },
  [
    ...ORCHESTRATION_STATE_REQUIRED,
    'annotationItems',
    'dispatchedRuns',
    'memoryCaptured',
    'nextOrchestratedAt',
    'summary',
  ],
);
const CYCLE_RESULT = closedObjectSchema(
  {
    campaignId: STRING_SCHEMA,
    dispatchCount: INTEGER_SCHEMA,
    dispatchedRuns: arraySchema(DISPATCH_PLAN),
    nextOrchestratedAt: NULLABLE_STRING,
    skippedReason: STRING_SCHEMA,
    summary: STRING_SCHEMA,
  },
  [
    'campaignId',
    'dispatchCount',
    'dispatchedRuns',
    'nextOrchestratedAt',
    'summary',
  ],
);

const WINNER_STATE = closedObjectSchema(
  {
    campaign: JSON_DOCUMENT_SCHEMA,
    campaignId: STRING_SCHEMA,
    organizationId: STRING_SCHEMA,
    skippedReason: STRING_SCHEMA,
    summary: STRING_SCHEMA,
    topContent: arraySchema(JSON_DOCUMENT_SCHEMA),
  },
  ['campaign', 'campaignId', 'organizationId', 'topContent'],
);
const WINNER_RESULT = closedObjectSchema(
  {
    campaignId: STRING_SCHEMA,
    extractedCount: INTEGER_SCHEMA,
    memoryId: STRING_SCHEMA,
    skippedReason: STRING_SCHEMA,
    summary: STRING_SCHEMA,
  },
  ['campaignId', 'extractedCount', 'summary'],
);

const TRIGGER_TYPE = enumSchema([
  'performance_dip',
  'trend_spike',
  'viral_post',
] as const);
const TRIGGER_INPUT = closedObjectSchema(
  {
    campaignId: STRING_SCHEMA,
    contentMixSummary: NULLABLE_STRING,
    organizationId: STRING_SCHEMA,
    postingRecommendations: arraySchema(JSON_DOCUMENT_SCHEMA),
    strategies: arraySchema(JSON_DOCUMENT_SCHEMA),
    triggerContextLines: arraySchema(STRING_SCHEMA),
    triggerMetadata: JSON_DOCUMENT_SCHEMA,
    triggerSummary: STRING_SCHEMA,
    triggerType: TRIGGER_TYPE,
  },
  [
    'campaignId',
    'contentMixSummary',
    'organizationId',
    'postingRecommendations',
    'strategies',
    'triggerContextLines',
    'triggerMetadata',
    'triggerSummary',
    'triggerType',
  ],
);
const TRIGGER_STATE_PROPERTIES = {
  analyticsOverview: JSON_DOCUMENT_SCHEMA,
  bestPostingTimes: arraySchema(JSON_DOCUMENT_SCHEMA),
  brandDescription: STRING_SCHEMA,
  campaign: JSON_DOCUMENT_SCHEMA,
  campaignId: STRING_SCHEMA,
  dispatchGroups: arraySchema(JSON_DOCUMENT_SCHEMA),
  items: arraySchema(TRIGGER_INPUT),
  organizationId: STRING_SCHEMA,
  skippedReason: STRING_SCHEMA,
  strategies: arraySchema(JSON_DOCUMENT_SCHEMA),
  topContent: arraySchema(JSON_DOCUMENT_SCHEMA),
  trends: arraySchema(JSON_DOCUMENT_SCHEMA),
} as const;
const TRIGGER_STATE_REQUIRED = [
  'analyticsOverview',
  'bestPostingTimes',
  'brandDescription',
  'campaign',
  'campaignId',
  'organizationId',
  'strategies',
  'topContent',
  'trends',
] as const;
const TRIGGER_STATE = closedObjectSchema(
  TRIGGER_STATE_PROPERTIES,
  TRIGGER_STATE_REQUIRED,
);
const TRIGGER_GROUP_STATE = closedObjectSchema(TRIGGER_STATE_PROPERTIES, [
  ...TRIGGER_STATE_REQUIRED,
  'items',
]);
const POSTING_RECOMMENDATION = closedObjectSchema(
  {
    organizationId: STRING_SCHEMA,
    preferredPostingTimes: arraySchema(STRING_SCHEMA),
    strategyId: STRING_SCHEMA,
  },
  ['organizationId', 'preferredPostingTimes', 'strategyId'],
);
const TRIGGER_RECOMMENDATION_STATE = closedObjectSchema(
  {
    ...TRIGGER_STATE_PROPERTIES,
    items: arraySchema(POSTING_RECOMMENDATION),
  },
  [...TRIGGER_STATE_REQUIRED, 'items'],
);
const TRIGGER_DISPATCH_STATE = closedObjectSchema(
  {
    campaign: JSON_DOCUMENT_SCHEMA,
    input: TRIGGER_INPUT,
    items: arraySchema(JSON_DOCUMENT_SCHEMA),
    nextOrchestratedAt: NULLABLE_STRING,
    skippedReason: STRING_SCHEMA,
    summary: STRING_SCHEMA,
  },
  ['campaign', 'input', 'items', 'nextOrchestratedAt'],
);
const TRIGGER_RUN_STATE = closedObjectSchema(
  { dispatch: DISPATCH_PLAN, trigger: TRIGGER_INPUT },
  ['dispatch', 'trigger'],
);
const TRIGGER_DISPATCH_ITEM = closedObjectSchema(
  {
    campaign: JSON_DOCUMENT_SCHEMA,
    creditBudget: NUMBER_SCHEMA,
    input: TRIGGER_INPUT,
    objective: STRING_SCHEMA,
    reason: STRING_SCHEMA,
    strategy: JSON_DOCUMENT_SCHEMA,
    userId: STRING_SCHEMA,
  },
  ['campaign', 'input', 'objective', 'reason', 'strategy', 'userId'],
);
const TRIGGER_RESULT = closedObjectSchema(
  {
    campaignId: STRING_SCHEMA,
    dispatchCount: INTEGER_SCHEMA,
    dispatchedTriggerTypes: arraySchema(TRIGGER_TYPE),
    skippedReason: STRING_SCHEMA,
    summary: STRING_SCHEMA,
  },
  ['campaignId', 'dispatchCount', 'dispatchedTriggerTypes', 'summary'],
);

const CONTRACTS: Readonly<Record<string, ActionContractSchemas>> = {
  'agent-campaign.memory.load-winners': {
    inputSchema: requestInput({ orchestration: CAPTURED_ORCHESTRATION_STATE }),
    outputSchema: WINNER_STATE,
  },
  'agent-campaign.memory.persist': {
    inputSchema: requestInput({ state: WINNER_STATE }, ['state']),
    outputSchema: WINNER_RESULT,
  },
  'agent-campaign.orchestration.annotate-run': {
    inputSchema: closedObjectSchema(
      { request: ORCHESTRATION_ANNOTATION_ITEM },
      ['request'],
    ),
    outputSchema: DISPATCH_PLAN,
  },
  'agent-campaign.orchestration.capture-memory': {
    inputSchema: requestInput({ state: SUMMARIZED_ORCHESTRATION_STATE }, [
      'state',
    ]),
    outputSchema: CAPTURED_ORCHESTRATION_STATE,
  },
  'agent-campaign.orchestration.discover-due': {
    inputSchema: EMPTY_INPUT,
    outputSchema: closedObjectSchema({ items: arraySchema(REQUEST) }, [
      'items',
    ]),
  },
  'agent-campaign.orchestration.dispatch-run': {
    inputSchema: closedObjectSchema({ request: CAMPAIGN_DISPATCH_ITEM }, [
      'request',
    ]),
    outputSchema: DISPATCH_PLAN,
  },
  'agent-campaign.orchestration.finalize': {
    inputSchema: requestInput(
      {
        annotations: JSON_DOCUMENT_SCHEMA,
        memory: WINNER_RESULT,
        state: CAPTURED_ORCHESTRATION_STATE,
      },
      ['state'],
    ),
    outputSchema: CYCLE_RESULT,
  },
  'agent-campaign.orchestration.load-context': {
    inputSchema: requestInput(),
    outputSchema: ORCHESTRATION_STATE,
  },
  'agent-campaign.orchestration.plan': {
    inputSchema: requestInput({ state: ORCHESTRATION_STATE }, ['state']),
    outputSchema: PLANNED_ORCHESTRATION_STATE,
  },
  'agent-campaign.orchestration.summarize': {
    inputSchema: requestInput(
      { batch: JSON_DOCUMENT_SCHEMA, state: PLANNED_ORCHESTRATION_STATE },
      ['batch', 'state'],
    ),
    outputSchema: SUMMARIZED_ORCHESTRATION_STATE,
  },
  'agent-campaign.triggers.annotate-run': {
    inputSchema: closedObjectSchema(
      { request: TRIGGER_DISPATCH_ITEM, state: TRIGGER_RUN_STATE },
      ['request', 'state'],
    ),
    outputSchema: DISPATCH_PLAN,
  },
  'agent-campaign.triggers.discover-due': {
    inputSchema: EMPTY_INPUT,
    outputSchema: closedObjectSchema({ items: arraySchema(REQUEST) }, [
      'items',
    ]),
  },
  'agent-campaign.triggers.dispatch-run': {
    inputSchema: closedObjectSchema({ request: TRIGGER_DISPATCH_ITEM }, [
      'request',
    ]),
    outputSchema: TRIGGER_RUN_STATE,
  },
  'agent-campaign.triggers.finalize': {
    inputSchema: requestInput(
      { batch: JSON_DOCUMENT_SCHEMA, state: TRIGGER_GROUP_STATE },
      ['batch', 'state'],
    ),
    outputSchema: TRIGGER_RESULT,
  },
  'agent-campaign.triggers.finalize-group': {
    inputSchema: requestInput(
      { batch: JSON_DOCUMENT_SCHEMA, state: TRIGGER_DISPATCH_STATE },
      ['batch', 'state'],
    ),
    outputSchema: CYCLE_RESULT,
  },
  'agent-campaign.triggers.load-context': {
    inputSchema: requestInput(),
    outputSchema: TRIGGER_STATE,
  },
  'agent-campaign.triggers.persist-recommendation': {
    inputSchema: closedObjectSchema({ request: POSTING_RECOMMENDATION }, [
      'request',
    ]),
    outputSchema: POSTING_RECOMMENDATION,
  },
  'agent-campaign.triggers.plan-dispatches': {
    inputSchema: closedObjectSchema({ request: TRIGGER_INPUT }, ['request']),
    outputSchema: TRIGGER_DISPATCH_STATE,
  },
  'agent-campaign.triggers.plan-groups': {
    inputSchema: requestInput(
      {
        recommendations: JSON_DOCUMENT_SCHEMA,
        state: TRIGGER_RECOMMENDATION_STATE,
      },
      ['state'],
    ),
    outputSchema: TRIGGER_GROUP_STATE,
  },
  'agent-campaign.triggers.plan-recommendations': {
    inputSchema: requestInput({ state: TRIGGER_STATE }, ['state']),
    outputSchema: TRIGGER_RECOMMENDATION_STATE,
  },
};

export function getAgentCampaignActionContract(
  actionId: string,
): ActionContractSchemas | undefined {
  return CONTRACTS[actionId];
}
