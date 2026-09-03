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
  nullableSchema,
  STRING_SCHEMA,
} from './schema-builders';

const DOC = JSON_DOCUMENT_SCHEMA;
const JSON_OBJECT = {
  additionalProperties: DOC,
  type: 'object',
} as const;
const COUNT = { minimum: 0, ...INTEGER_SCHEMA } as const;
const REQUEST_PROPERTY = { request: DOC } as const;
const input = (
  properties: Readonly<Record<string, ActionJsonSchema>> = {},
  required: readonly string[] = [],
) => closedObjectSchema({ ...properties, ...REQUEST_PROPERTY }, required);
const batchInput = (
  properties: Readonly<Record<string, ActionJsonSchema>> = {},
  required: readonly string[] = [],
) => input({ batch: DOC, ...properties }, ['batch', ...required]);
const BEGIN_OUTPUT = closedObjectSchema(
  {
    acquired: BOOLEAN_SCHEMA,
    lockKey: STRING_SCHEMA,
    organizationId: STRING_SCHEMA,
    reason: STRING_SCHEMA,
  },
  ['acquired', 'lockKey', 'organizationId'],
);
const SOCIAL_BEGIN_OUTPUT = closedObjectSchema(
  {
    acquired: BOOLEAN_SCHEMA,
    enabled: BOOLEAN_SCHEMA,
    lockKey: STRING_SCHEMA,
    organizationId: STRING_SCHEMA,
  },
  ['acquired', 'enabled', 'lockKey', 'organizationId'],
);
const FAIL_INPUT = input({ failure: DOC, state: DOC }, ['failure', 'state']);
const FAIL_OUTPUT = closedObjectSchema(
  { organizationId: STRING_SCHEMA, released: BOOLEAN_SCHEMA },
  ['organizationId', 'released'],
);
const BASE_INPUT = closedObjectSchema({ organizationId: STRING_SCHEMA }, [
  'organizationId',
]);
const discoveryOutput = (
  item: ActionJsonSchema = DOC,
  additions: Readonly<Record<string, ActionJsonSchema>> = {},
  required: readonly string[] = [],
) =>
  closedObjectSchema(
    { baseInput: BASE_INPUT, items: arraySchema(item), ...additions },
    ['baseInput', 'items', ...required],
  );
const sweepFinalInput = batchInput({ discovery: DOC, state: DOC }, [
  'discovery',
  'state',
]);
const countResult = (
  action: string,
  countNames: readonly string[],
  statuses: readonly string[] = ['completed', 'skipped'],
) =>
  closedObjectSchema(
    {
      action: { const: action, type: 'string' },
      organizationId: STRING_SCHEMA,
      reason: STRING_SCHEMA,
      status: enumSchema(statuses),
      ...Object.fromEntries(countNames.map((name) => [name, COUNT])),
    },
    ['action', ...countNames, 'organizationId', 'status'],
  );

const AGENT_FINAL = closedObjectSchema(
  {
    action: { const: 'agent.autopilot.proactive', type: 'string' },
    enqueued: COUNT,
    executionIds: arraySchema(STRING_SCHEMA),
    generated: COUNT,
    organizationId: STRING_SCHEMA,
    reason: STRING_SCHEMA,
    skipped: COUNT,
    status: enumSchema(['completed', 'enqueued', 'skipped'] as const),
    workflowExecutionId: STRING_SCHEMA,
    workflowId: STRING_SCHEMA,
    workflowRunId: STRING_SCHEMA,
  },
  ['action', 'enqueued', 'generated', 'organizationId', 'skipped', 'status'],
);
const AGENT_STRATEGY = closedObjectSchema(
  {
    brandId: STRING_SCHEMA,
    config: JSON_OBJECT,
    goalId: STRING_SCHEMA,
    id: STRING_SCHEMA,
    label: STRING_SCHEMA,
    organizationId: STRING_SCHEMA,
    userId: STRING_SCHEMA,
  },
  ['config', 'id', 'organizationId', 'userId'],
);
const CONTENT_ENGINE_BRAND = closedObjectSchema(
  {
    agentConfig: JSON_OBJECT,
    id: STRING_SCHEMA,
    userId: STRING_SCHEMA,
  },
  ['agentConfig', 'id'],
);
const PERSONA = closedObjectSchema(
  {
    brandId: STRING_SCHEMA,
    config: JSON_OBJECT,
    credentialCount: COUNT,
    id: STRING_SCHEMA,
    label: STRING_SCHEMA,
    organizationId: STRING_SCHEMA,
    userId: STRING_SCHEMA,
  },
  ['config', 'credentialCount', 'id', 'label', 'organizationId', 'userId'],
);
const CONTENT_RESULT = countResult('content.production.engine', [
  'failed',
  'processed',
  'skipped',
]);
const CONTENT_PIPELINE_RESULT = countResult('content.production.autopilot', [
  'failed',
  'processed',
  'skipped',
]);
const PLAN_STATE = {
  oneOf: [
    closedObjectSchema(
      {
        brandId: STRING_SCHEMA,
        organizationId: STRING_SCHEMA,
        planId: STRING_SCHEMA,
        status: { const: 'planned', type: 'string' },
        userId: STRING_SCHEMA,
      },
      ['brandId', 'organizationId', 'planId', 'status', 'userId'],
    ),
    closedObjectSchema(
      {
        error: STRING_SCHEMA,
        organizationId: STRING_SCHEMA,
        status: { const: 'failed', type: 'string' },
      },
      ['error', 'organizationId', 'status'],
    ),
  ],
} as const;
const EXECUTION_RESULT = closedObjectSchema(
  {
    error: STRING_SCHEMA,
    itemId: STRING_SCHEMA,
    postId: STRING_SCHEMA,
    status: STRING_SCHEMA,
  },
  ['itemId', 'status'],
);
const PLAN_ITEM_STATE = closedObjectSchema(
  {
    brandId: STRING_SCHEMA,
    childWorkflowId: STRING_SCHEMA,
    context: DOC,
    isSkill: BOOLEAN_SCHEMA,
    item: DOC,
    itemId: STRING_SCHEMA,
    organizationId: STRING_SCHEMA,
    params: DOC,
    planId: STRING_SCHEMA,
    result: EXECUTION_RESULT,
    skill: DOC,
    userId: STRING_SCHEMA,
  },
  ['brandId', 'isSkill', 'itemId', 'organizationId', 'planId', 'userId'],
);
const PERSONA_STATE = closedObjectSchema(
  {
    imageItems: arraySchema(DOC),
    musicItems: arraySchema(DOC),
    now: STRING_SCHEMA,
    persona: PERSONA,
    personaId: STRING_SCHEMA,
    status: enumSchema(['prepared', 'skipped'] as const),
    videoItems: arraySchema(DOC),
  },
  [
    'imageItems',
    'musicItems',
    'now',
    'persona',
    'personaId',
    'status',
    'videoItems',
  ],
);
const REPLY_TARGET_RESULT = closedObjectSchema(
  {
    errors: COUNT,
    status: enumSchema(['failed', 'processed'] as const),
    triggered: COUNT,
  },
  ['errors', 'status', 'triggered'],
);
const SOCIAL_WORKFLOW_NODE = closedObjectSchema(
  {
    data: closedObjectSchema({ config: JSON_OBJECT, label: STRING_SCHEMA }, []),
    id: STRING_SCHEMA,
    type: STRING_SCHEMA,
  },
  ['id', 'type'],
);
const SOCIAL_WORKFLOW = closedObjectSchema(
  {
    config: JSON_OBJECT,
    defaultRecurringBrandId: nullableSchema(STRING_SCHEMA),
    id: STRING_SCHEMA,
    nodes: arraySchema(SOCIAL_WORKFLOW_NODE),
    organizationId: STRING_SCHEMA,
    userId: STRING_SCHEMA,
  },
  ['id', 'nodes', 'organizationId', 'userId'],
);
const SOCIAL_TRIGGER_ITEM = closedObjectSchema(
  { node: SOCIAL_WORKFLOW_NODE, workflow: SOCIAL_WORKFLOW },
  ['node', 'workflow'],
);
const replyFinal = (action: string) =>
  countResult(action, ['checked', 'errors', 'skipped', 'triggered']);

const CADENCE = enumSchema(['daily', 'hourly', 'weekly'] as const);
const CHANNELS = closedObjectSchema(
  {
    email: BOOLEAN_SCHEMA,
    inApp: BOOLEAN_SCHEMA,
    telegram: BOOLEAN_SCHEMA,
  },
  ['email', 'inApp', 'telegram'],
);
const TREND_ITEM = closedObjectSchema(
  {
    platform: STRING_SCHEMA,
    topic: STRING_SCHEMA,
    type: enumSchema(['hashtag', 'sound', 'topic', 'video'] as const),
    url: STRING_SCHEMA,
    usageCount: NUMBER_SCHEMA,
    viralScore: NUMBER_SCHEMA,
  },
  ['platform', 'topic', 'type', 'viralScore'],
);
const TREND_STATE = closedObjectSchema(
  {
    cadence: CADENCE,
    channels: CHANNELS,
    emailAddress: nullableSchema(STRING_SCHEMA),
    markerKey: STRING_SCHEMA,
    markerTtlSeconds: NUMBER_SCHEMA,
    minViralScore: NUMBER_SCHEMA,
    organizationId: STRING_SCHEMA,
    ownerUserId: STRING_SCHEMA,
    reason: STRING_SCHEMA,
    status: enumSchema(['prepared', 'rendered', 'skipped'] as const),
    summaryHtml: STRING_SCHEMA,
    summaryMessage: STRING_SCHEMA,
    telegramChatId: nullableSchema(STRING_SCHEMA),
    trends: arraySchema(TREND_ITEM),
  },
  ['cadence', 'organizationId', 'status'],
);
const TREND_LIST = closedObjectSchema({ trends: arraySchema(TREND_ITEM) }, [
  'trends',
]);
const DELIVERY = closedObjectSchema(
  {
    channel: enumSchema(['email', 'inApp', 'telegram'] as const),
    errors: COUNT,
    sent: COUNT,
    skipped: BOOLEAN_SCHEMA,
  },
  ['channel', 'sent'],
);
const TREND_FINAL = closedObjectSchema(
  {
    action: { const: 'trends.notifications.summary', type: 'string' },
    cadence: CADENCE,
    channels: CHANNELS,
    errors: COUNT,
    organizationId: STRING_SCHEMA,
    reason: STRING_SCHEMA,
    sent: COUNT,
    skipped: COUNT,
    status: enumSchema(['completed', 'skipped'] as const),
    trends: COUNT,
  },
  [
    'action',
    'cadence',
    'channels',
    'errors',
    'organizationId',
    'sent',
    'skipped',
    'status',
    'trends',
  ],
);

const LIVESTREAM_SESSION = closedObjectSchema(
  {
    botId: nullableSchema(STRING_SCHEMA),
    context: JSON_OBJECT,
    deliveryHistory: arraySchema(DOC),
    id: STRING_SCHEMA,
    lastTranscriptAt: nullableSchema(STRING_SCHEMA),
    organizationId: STRING_SCHEMA,
    pausedAt: nullableSchema(STRING_SCHEMA),
    platformStates: arraySchema(DOC),
    startedAt: nullableSchema(STRING_SCHEMA),
    status: STRING_SCHEMA,
    stoppedAt: nullableSchema(STRING_SCHEMA),
    transcriptChunks: arraySchema(DOC),
  },
  ['id', 'organizationId', 'status'],
);
const LIVESTREAM_BOT = closedObjectSchema(
  {
    id: STRING_SCHEMA,
    livestreamSettings: JSON_OBJECT,
    organizationId: STRING_SCHEMA,
    targets: arraySchema(DOC),
  },
  ['id', 'organizationId', 'targets'],
);
const LIVESTREAM_LOAD = closedObjectSchema(
  {
    bot: LIVESTREAM_BOT,
    error: STRING_SCHEMA,
    session: LIVESTREAM_SESSION,
    sessionId: STRING_SCHEMA,
    status: enumSchema(['failed', 'loaded', 'skipped'] as const),
  },
  ['sessionId', 'status'],
);
const LIVESTREAM_TARGETS = closedObjectSchema(
  {
    baseInput: closedObjectSchema(
      {
        bot: LIVESTREAM_BOT,
        organizationId: STRING_SCHEMA,
        sessionId: STRING_SCHEMA,
      },
      ['bot', 'organizationId', 'sessionId'],
    ),
    bot: LIVESTREAM_BOT,
    error: STRING_SCHEMA,
    items: arraySchema(DOC),
    session: LIVESTREAM_SESSION,
    sessionId: STRING_SCHEMA,
    status: enumSchema(['failed', 'loaded', 'skipped'] as const),
  },
  ['baseInput', 'items', 'sessionId', 'status'],
);
const RESTREAM_STATE = closedObjectSchema(
  {
    bot: LIVESTREAM_BOT,
    botId: STRING_SCHEMA,
    ingested: COUNT,
    organizationId: STRING_SCHEMA,
    reason: STRING_SCHEMA,
    status: STRING_SCHEMA,
  },
  ['botId', 'organizationId', 'status'],
);
const PROMOTION_COUNTS = closedObjectSchema(
  { promoted: COUNT, skipped: COUNT },
  ['promoted', 'skipped'],
);
const PERFORMANCE_CONTENT_ITEM = closedObjectSchema(
  {
    comments: NUMBER_SCHEMA,
    description: STRING_SCHEMA,
    engagementRate: NUMBER_SCHEMA,
    likes: NUMBER_SCHEMA,
    platform: STRING_SCHEMA,
    postId: STRING_SCHEMA,
    publishDate: STRING_SCHEMA,
    saves: NUMBER_SCHEMA,
    shares: NUMBER_SCHEMA,
    title: STRING_SCHEMA,
    views: NUMBER_SCHEMA,
  },
  [
    'comments',
    'description',
    'engagementRate',
    'likes',
    'platform',
    'postId',
    'saves',
    'shares',
    'title',
    'views',
  ],
);
const WINNER_CANDIDATE = closedObjectSchema(
  { content: STRING_SCHEMA, item: PERFORMANCE_CONTENT_ITEM },
  ['content', 'item'],
);
const PAID_ADVERTISER = closedObjectSchema(
  {
    advertiserHandle: STRING_SCHEMA,
    brandId: nullableSchema(STRING_SCHEMA),
    externalAdvertiserId: nullableSchema(STRING_SCHEMA),
    id: STRING_SCHEMA,
    organizationId: STRING_SCHEMA,
    platform: STRING_SCHEMA,
  },
  [
    'advertiserHandle',
    'brandId',
    'externalAdvertiserId',
    'id',
    'organizationId',
    'platform',
  ],
);
const PAID_INGESTION = closedObjectSchema(
  {
    advertiserId: STRING_SCHEMA,
    errorCode: STRING_SCHEMA,
    platform: STRING_SCHEMA,
    recordCount: COUNT,
    status: enumSchema(['error', 'success', 'unavailable'] as const),
  },
  ['advertiserId', 'platform', 'recordCount', 'status'],
);

const CONTRACTS: Readonly<Record<string, ActionContractSchemas>> = {
  'agent.autopilot.begin': { inputSchema: input(), outputSchema: BEGIN_OUTPUT },
  'agent.autopilot.discover-credit-resets': {
    inputSchema: input({ state: BEGIN_OUTPUT }, ['state']),
    outputSchema: discoveryOutput(AGENT_STRATEGY),
  },
  'agent.autopilot.reset-credit-window': {
    inputSchema: input(
      {
        item: AGENT_STRATEGY,
        now: STRING_SCHEMA,
        organizationId: STRING_SCHEMA,
      },
      ['item', 'now', 'organizationId'],
    ),
    outputSchema: closedObjectSchema(
      {
        status: { const: 'reset', type: 'string' },
        strategyId: STRING_SCHEMA,
      },
      ['status', 'strategyId'],
    ),
  },
  'agent.autopilot.discover': {
    inputSchema: input({ resetBatch: DOC, state: BEGIN_OUTPUT }, ['state']),
    outputSchema: discoveryOutput(
      AGENT_STRATEGY,
      { organizationId: STRING_SCHEMA },
      ['organizationId'],
    ),
  },
  'agent.autopilot.dispatch-strategy': {
    inputSchema: input(
      { item: AGENT_STRATEGY, organizationId: STRING_SCHEMA },
      ['item', 'organizationId'],
    ),
    outputSchema: closedObjectSchema(
      {
        executionId: STRING_SCHEMA,
        status: enumSchema(['enqueued', 'skipped'] as const),
      },
      ['status'],
    ),
  },
  'agent.autopilot.finalize': {
    inputSchema: sweepFinalInput,
    outputSchema: AGENT_FINAL,
  },
  'agent.autopilot.fail': {
    inputSchema: FAIL_INPUT,
    outputSchema: FAIL_OUTPUT,
  },

  'content.production.engine.begin': {
    inputSchema: input(),
    outputSchema: BEGIN_OUTPUT,
  },
  'content.production.engine.discover-brands': {
    inputSchema: input({ state: BEGIN_OUTPUT }, ['state']),
    outputSchema: discoveryOutput(CONTENT_ENGINE_BRAND, { skipped: COUNT }, [
      'skipped',
    ]),
  },
  'content.production.engine.plan-brand': {
    inputSchema: input(
      { item: CONTENT_ENGINE_BRAND, organizationId: STRING_SCHEMA },
      ['item', 'organizationId'],
    ),
    outputSchema: PLAN_STATE,
  },
  'content.production.engine.prepare-plan': {
    inputSchema: input({}, ['request']),
    outputSchema: discoveryOutput(DOC, { planId: STRING_SCHEMA }, ['planId']),
  },
  'content.production.engine.prepare-plan-item': {
    inputSchema: input(
      {
        brandId: STRING_SCHEMA,
        item: DOC,
        organizationId: STRING_SCHEMA,
        planId: STRING_SCHEMA,
        userId: STRING_SCHEMA,
      },
      ['brandId', 'item', 'userId'],
    ),
    outputSchema: PLAN_ITEM_STATE,
  },
  'content.production.engine.run-skill-item': {
    inputSchema: input({ state: DOC }, ['state']),
    outputSchema: PLAN_ITEM_STATE,
  },
  'content.production.engine.persist-skill-item': {
    inputSchema: input({ state: DOC }, ['state']),
    outputSchema: PLAN_ITEM_STATE,
  },
  'content.production.engine.execute-mediaquery-item': {
    inputSchema: input({ state: DOC }, ['state']),
    outputSchema: EXECUTION_RESULT,
  },
  'content.production.engine.finalize-plan': {
    inputSchema: batchInput({ state: PLAN_STATE }, ['state']),
    outputSchema: closedObjectSchema(
      {
        results: arraySchema(EXECUTION_RESULT),
        status: { const: 'processed', type: 'string' },
        summary: closedObjectSchema(
          { completed: COUNT, failed: COUNT, total: COUNT },
          ['completed', 'failed', 'total'],
        ),
      },
      ['results', 'status', 'summary'],
    ),
  },
  'content.production.engine.finalize': {
    inputSchema: sweepFinalInput,
    outputSchema: CONTENT_RESULT,
  },
  'content.production.engine.fail': {
    inputSchema: FAIL_INPUT,
    outputSchema: FAIL_OUTPUT,
  },
  'content.production.autopilot.begin': {
    inputSchema: input(),
    outputSchema: BEGIN_OUTPUT,
  },
  'content.production.autopilot.discover-personas': {
    inputSchema: input({ state: BEGIN_OUTPUT }, ['state']),
    outputSchema: discoveryOutput(PERSONA),
  },
  'content.production.autopilot.prepare-persona': {
    inputSchema: input(
      { item: PERSONA, now: STRING_SCHEMA, organizationId: STRING_SCHEMA },
      ['item', 'now', 'organizationId'],
    ),
    outputSchema: PERSONA_STATE,
  },
  'content.production.autopilot.schedule-persona': {
    inputSchema: input(
      {
        imageBatch: DOC,
        musicBatch: DOC,
        state: PERSONA_STATE,
        videoBatch: DOC,
      },
      ['imageBatch', 'musicBatch', 'state', 'videoBatch'],
    ),
    outputSchema: closedObjectSchema(
      {
        personaId: STRING_SCHEMA,
        status: enumSchema(['processed', 'skipped'] as const),
      },
      ['personaId', 'status'],
    ),
  },
  'content.production.autopilot.finalize': {
    inputSchema: sweepFinalInput,
    outputSchema: CONTENT_PIPELINE_RESULT,
  },
  'content.production.autopilot.fail': {
    inputSchema: FAIL_INPUT,
    outputSchema: FAIL_OUTPUT,
  },

  'reply.polling.bots.begin': {
    inputSchema: input(),
    outputSchema: BEGIN_OUTPUT,
  },
  'reply.polling.bots.discover-targets': {
    inputSchema: input({ state: BEGIN_OUTPUT }, ['state']),
    outputSchema: discoveryOutput(
      closedObjectSchema(
        { credentialId: STRING_SCHEMA, organizationId: STRING_SCHEMA },
        ['credentialId', 'organizationId'],
      ),
    ),
  },
  'reply.polling.bots.prepare-target': {
    inputSchema: input({ item: DOC, organizationId: STRING_SCHEMA }, [
      'item',
      'organizationId',
    ]),
    outputSchema: closedObjectSchema(
      { credentialId: STRING_SCHEMA, organizationId: STRING_SCHEMA },
      ['credentialId', 'organizationId'],
    ),
  },
  'reply.polling.bots.finalize-target': {
    inputSchema: input({ results: arraySchema(DOC) }, ['results']),
    outputSchema: REPLY_TARGET_RESULT,
  },
  'reply.polling.bots.finalize': {
    inputSchema: sweepFinalInput,
    outputSchema: replyFinal('reply.polling.bots'),
  },
  'reply.polling.bots.fail': {
    inputSchema: FAIL_INPUT,
    outputSchema: FAIL_OUTPUT,
  },
  'reply.polling.social.begin': {
    inputSchema: input(),
    outputSchema: SOCIAL_BEGIN_OUTPUT,
  },
  'reply.polling.social.discover-workflows': {
    inputSchema: input({ state: SOCIAL_BEGIN_OUTPUT }, ['state']),
    outputSchema: discoveryOutput(SOCIAL_TRIGGER_ITEM),
  },
  'reply.polling.social.process-trigger': {
    inputSchema: input(
      { item: SOCIAL_TRIGGER_ITEM, organizationId: STRING_SCHEMA },
      ['item', 'organizationId'],
    ),
    outputSchema: REPLY_TARGET_RESULT,
  },
  'reply.polling.social.finalize': {
    inputSchema: sweepFinalInput,
    outputSchema: replyFinal('reply.polling.social-triggers'),
  },
  'reply.polling.social.fail': {
    inputSchema: FAIL_INPUT,
    outputSchema: FAIL_OUTPUT,
  },

  'trends.notifications.prepare': {
    inputSchema: input({}, ['request']),
    outputSchema: TREND_STATE,
  },
  'trends.notifications.read-videos': {
    inputSchema: input({ state: TREND_STATE }, ['state']),
    outputSchema: TREND_LIST,
  },
  'trends.notifications.read-hashtags': {
    inputSchema: input({ state: TREND_STATE }, ['state']),
    outputSchema: TREND_LIST,
  },
  'trends.notifications.read-sounds': {
    inputSchema: input({ state: TREND_STATE }, ['state']),
    outputSchema: TREND_LIST,
  },
  'trends.notifications.render': {
    inputSchema: input(
      {
        hashtags: TREND_LIST,
        sounds: TREND_LIST,
        state: TREND_STATE,
        videos: TREND_LIST,
      },
      ['hashtags', 'sounds', 'state', 'videos'],
    ),
    outputSchema: TREND_STATE,
  },
  'trends.notifications.deliver-telegram': {
    inputSchema: input({ state: TREND_STATE }, ['state']),
    outputSchema: DELIVERY,
  },
  'trends.notifications.deliver-email': {
    inputSchema: input({ state: TREND_STATE }, ['state']),
    outputSchema: DELIVERY,
  },
  'trends.notifications.deliver-in-app': {
    inputSchema: input({ state: TREND_STATE }, ['state']),
    outputSchema: DELIVERY,
  },
  'trends.notifications.finalize': {
    inputSchema: input(
      {
        email: DELIVERY,
        inApp: DELIVERY,
        prepared: TREND_STATE,
        telegram: DELIVERY,
      },
      ['email', 'inApp', 'prepared', 'telegram'],
    ),
    outputSchema: TREND_FINAL,
  },

  'livestream.sessions.begin': {
    inputSchema: input(),
    outputSchema: BEGIN_OUTPUT,
  },
  'livestream.sessions.discover': {
    inputSchema: input({ state: BEGIN_OUTPUT }, ['state']),
    outputSchema: discoveryOutput(LIVESTREAM_SESSION),
  },
  'livestream.sessions.load-one': {
    inputSchema: input(
      { item: LIVESTREAM_SESSION, organizationId: STRING_SCHEMA },
      ['item', 'organizationId'],
    ),
    outputSchema: LIVESTREAM_LOAD,
  },
  'livestream.sessions.sync-restream': {
    inputSchema: input({ state: LIVESTREAM_LOAD }, ['state']),
    outputSchema: LIVESTREAM_LOAD,
  },
  'livestream.sessions.discover-targets': {
    inputSchema: input({ state: LIVESTREAM_LOAD }, ['state']),
    outputSchema: LIVESTREAM_TARGETS,
  },
  'livestream.sessions.deliver-target': {
    inputSchema: input(
      {
        bot: LIVESTREAM_BOT,
        item: DOC,
        organizationId: STRING_SCHEMA,
        sessionId: STRING_SCHEMA,
      },
      ['bot', 'item', 'organizationId', 'sessionId'],
    ),
    outputSchema: closedObjectSchema(
      {
        error: STRING_SCHEMA,
        status: enumSchema(['failed', 'processed', 'skipped'] as const),
        targetId: STRING_SCHEMA,
      },
      ['status'],
    ),
  },
  'livestream.sessions.finalize-one': {
    inputSchema: batchInput({ state: LIVESTREAM_TARGETS }, ['state']),
    outputSchema: closedObjectSchema(
      {
        sessionId: STRING_SCHEMA,
        status: enumSchema(['failed', 'processed', 'skipped'] as const),
        targets: COUNT,
      },
      ['sessionId', 'status', 'targets'],
    ),
  },
  'livestream.sessions.finalize': {
    inputSchema: sweepFinalInput,
    outputSchema: countResult('livestream.sessions.process', [
      'failed',
      'processed',
      'sessions',
      'skipped',
    ]),
  },
  'livestream.sessions.fail': {
    inputSchema: FAIL_INPUT,
    outputSchema: FAIL_OUTPUT,
  },
  'livestream.restream.load-bot': {
    inputSchema: input({ botId: STRING_SCHEMA }),
    outputSchema: RESTREAM_STATE,
  },
  'livestream.restream.sync-chat': {
    inputSchema: input({ state: RESTREAM_STATE }, ['state']),
    outputSchema: RESTREAM_STATE,
  },
  'livestream.restream.finalize': {
    inputSchema: input({ loaded: RESTREAM_STATE, synced: RESTREAM_STATE }, [
      'loaded',
      'synced',
    ]),
    outputSchema: closedObjectSchema(
      {
        action: { const: 'livestream.restream.ingest', type: 'string' },
        botId: STRING_SCHEMA,
        ingested: COUNT,
        organizationId: STRING_SCHEMA,
        reason: STRING_SCHEMA,
        status: STRING_SCHEMA,
      },
      ['action', 'botId', 'ingested', 'organizationId', 'status'],
    ),
  },

  'harness.winners.begin': {
    inputSchema: input(),
    outputSchema: BEGIN_OUTPUT,
  },
  'harness.winners.discover-brands': {
    inputSchema: input({ state: BEGIN_OUTPUT }, ['state']),
    outputSchema: discoveryOutput(STRING_SCHEMA, { reason: STRING_SCHEMA }),
  },
  'harness.winners.prepare-brand': {
    inputSchema: input({ item: STRING_SCHEMA, organizationId: STRING_SCHEMA }, [
      'item',
      'organizationId',
    ]),
    outputSchema: closedObjectSchema(
      {
        baseInput: closedObjectSchema(
          { contextBaseId: STRING_SCHEMA, organizationId: STRING_SCHEMA },
          ['contextBaseId', 'organizationId'],
        ),
        brandId: STRING_SCHEMA,
        items: arraySchema(WINNER_CANDIDATE),
        skipped: COUNT,
      },
      ['baseInput', 'brandId', 'items', 'skipped'],
    ),
  },
  'harness.winners.promote-item': {
    inputSchema: input(
      {
        contextBaseId: STRING_SCHEMA,
        item: WINNER_CANDIDATE,
        organizationId: STRING_SCHEMA,
      },
      ['contextBaseId', 'item', 'organizationId'],
    ),
    outputSchema: PROMOTION_COUNTS,
  },
  'harness.winners.finalize-brand': {
    inputSchema: batchInput({ state: DOC }, ['state']),
    outputSchema: closedObjectSchema(
      {
        brandId: STRING_SCHEMA,
        promoted: COUNT,
        skipped: COUNT,
        status: { const: 'promoted', type: 'string' },
      },
      ['brandId', 'promoted', 'skipped', 'status'],
    ),
  },
  'harness.winners.finalize': {
    inputSchema: sweepFinalInput,
    outputSchema: countResult('harness.winners.promote', [
      'brandsEligible',
      'brandsFailed',
      'brandsPromoted',
      'promoted',
    ]),
  },
  'harness.winners.fail': {
    inputSchema: FAIL_INPUT,
    outputSchema: FAIL_OUTPUT,
  },

  'paid-creative.research.prepare': {
    inputSchema: input(),
    outputSchema: closedObjectSchema(
      {
        available: BOOLEAN_SCHEMA,
        organizationId: STRING_SCHEMA,
        reason: STRING_SCHEMA,
      },
      ['available', 'organizationId'],
    ),
  },
  'paid-creative.research.discover-advertisers': {
    inputSchema: input({ state: DOC }, ['state']),
    outputSchema: discoveryOutput(PAID_ADVERTISER),
  },
  'paid-creative.research.ingest-advertiser': {
    inputSchema: input(
      { item: PAID_ADVERTISER, organizationId: STRING_SCHEMA },
      ['item', 'organizationId'],
    ),
    outputSchema: PAID_INGESTION,
  },
  'paid-creative.research.finalize': {
    inputSchema: batchInput({ state: DOC }, ['state']),
    outputSchema: countResult('paid-creative.research.ingest', [
      'advertisersChecked',
      'errors',
      'recordsIngested',
      'skipped',
    ]),
  },
};

export function getAutomationActionContract(
  actionId: string,
): ActionContractSchemas | undefined {
  return CONTRACTS[actionId];
}

export const AUTOMATION_CONTRACT_ACTION_IDS = Object.freeze(
  Object.keys(CONTRACTS),
);
