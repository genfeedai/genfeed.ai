import type {
  WorkflowEdge,
  WorkflowInputVariable,
  WorkflowVisualNode,
} from '@api/collections/workflows/schemas/workflow.schema';
import type { SystemWorkflowGraphDefinition } from '@api/collections/workflows/system-workflow-runner.service';
import { REPLY_BOT_WORKFLOW_IDS } from '@api/services/reply-bot/reply-bot-workflow-definition';
import { createGenfeedActionNode } from '@genfeedai/actions';

export const AUTOMATION_WORKFLOW_IDS = {
  AGENT_PROACTIVE: 'agent.autopilot.proactive',
  AGENT_RESET: 'agent.autopilot.reset-one',
  AGENT_STRATEGY: 'agent.autopilot.strategy',
  CONTENT_ENGINE: 'content.production.engine',
  CONTENT_ENGINE_BRAND: 'content.production.engine.brand',
  CONTENT_ENGINE_ITEM: 'content.production.engine.plan-item',
  CONTENT_ENGINE_PLAN: 'content.production.engine.plan',
  CONTENT_PIPELINE: 'content.production.autopilot',
  CONTENT_PIPELINE_IMAGE: 'content.production.autopilot.pipeline.image',
  CONTENT_PIPELINE_MUSIC: 'content.production.autopilot.pipeline.music',
  CONTENT_PIPELINE_PERSONA: 'content.production.autopilot.persona',
  CONTENT_PIPELINE_VIDEO: 'content.production.autopilot.pipeline.video',
  HARNESS_WINNERS: 'harness.winners.promote',
  HARNESS_WINNERS_BRAND: 'harness.winners.promote.brand',
  HARNESS_WINNERS_ITEM: 'harness.winners.promote.item',
  LIVESTREAM_RESTREAM: 'livestream.restream.ingest',
  LIVESTREAM_SESSIONS: 'livestream.sessions.process',
  LIVESTREAM_SESSION: 'livestream.sessions.process.one',
  LIVESTREAM_TARGET: 'livestream.sessions.deliver-target',
  PAID_CREATIVE: 'paid-creative.research.ingest',
  PAID_CREATIVE_ADVERTISER: 'paid-creative.research.ingest.advertiser',
  REPLY_BOTS: 'reply.polling.bots',
  REPLY_BOT_TARGET: 'reply.polling.bots.target',
  SOCIAL_TRIGGERS: 'reply.polling.social-triggers',
  SOCIAL_TRIGGER_WORKFLOW: 'reply.polling.social-triggers.workflow',
  TREND_NOTIFICATIONS: 'trends.notifications.summary',
} as const;

export const AUTOMATION_ACTION_IDS = {
  AGENT_BEGIN: 'agent.autopilot.begin',
  AGENT_DISCOVER: 'agent.autopilot.discover',
  AGENT_DISCOVER_RESETS: 'agent.autopilot.discover-credit-resets',
  AGENT_DISPATCH: 'agent.autopilot.dispatch-strategy',
  AGENT_FAIL: 'agent.autopilot.fail',
  AGENT_FINALIZE: 'agent.autopilot.finalize',
  AGENT_RESET: 'agent.autopilot.reset-credit-window',
  CONTENT_ENGINE_BEGIN: 'content.production.engine.begin',
  CONTENT_ENGINE_DISCOVER: 'content.production.engine.discover-brands',
  CONTENT_ENGINE_EXECUTE_ITEM: 'content.production.engine.execute-plan-item',
  CONTENT_ENGINE_FAIL: 'content.production.engine.fail',
  CONTENT_ENGINE_FINALIZE: 'content.production.engine.finalize',
  CONTENT_ENGINE_PLAN: 'content.production.engine.plan-brand',
  CONTENT_ENGINE_PLAN_FINALIZE: 'content.production.engine.finalize-plan',
  CONTENT_ENGINE_PLAN_PREPARE: 'content.production.engine.prepare-plan',
  CONTENT_PIPELINE_BEGIN: 'content.production.autopilot.begin',
  CONTENT_PIPELINE_DISCOVER: 'content.production.autopilot.discover-personas',
  CONTENT_PIPELINE_FAIL: 'content.production.autopilot.fail',
  CONTENT_PIPELINE_FINALIZE: 'content.production.autopilot.finalize',
  CONTENT_PIPELINE_PREPARE: 'content.production.autopilot.prepare-persona',
  CONTENT_PIPELINE_SCHEDULE: 'content.production.autopilot.schedule-persona',
  HARNESS_BEGIN: 'harness.winners.begin',
  HARNESS_DISCOVER: 'harness.winners.discover-brands',
  HARNESS_FAIL: 'harness.winners.fail',
  HARNESS_FINALIZE_BRAND: 'harness.winners.finalize-brand',
  HARNESS_FINALIZE: 'harness.winners.finalize',
  HARNESS_PREPARE_BRAND: 'harness.winners.prepare-brand',
  HARNESS_PROMOTE_ITEM: 'harness.winners.promote-item',
  LIVESTREAM_BEGIN: 'livestream.sessions.begin',
  LIVESTREAM_DISCOVER: 'livestream.sessions.discover',
  LIVESTREAM_FAIL: 'livestream.sessions.fail',
  LIVESTREAM_FINALIZE: 'livestream.sessions.finalize',
  LIVESTREAM_SESSION_DISCOVER_TARGETS: 'livestream.sessions.discover-targets',
  LIVESTREAM_SESSION_FINALIZE: 'livestream.sessions.finalize-one',
  LIVESTREAM_SESSION_LOAD: 'livestream.sessions.load-one',
  LIVESTREAM_SESSION_SYNC_RESTREAM: 'livestream.sessions.sync-restream',
  LIVESTREAM_TARGET_DELIVER: 'livestream.sessions.deliver-target',
  RESTREAM_FINALIZE: 'livestream.restream.finalize',
  RESTREAM_LOAD: 'livestream.restream.load-bot',
  RESTREAM_SYNC: 'livestream.restream.sync-chat',
  PAID_CREATIVE_DISCOVER: 'paid-creative.research.discover-advertisers',
  PAID_CREATIVE_FINALIZE: 'paid-creative.research.finalize',
  PAID_CREATIVE_INGEST: 'paid-creative.research.ingest-advertiser',
  PAID_CREATIVE_PREPARE: 'paid-creative.research.prepare',
  REPLY_BEGIN: 'reply.polling.bots.begin',
  REPLY_DISCOVER: 'reply.polling.bots.discover-targets',
  REPLY_FAIL: 'reply.polling.bots.fail',
  REPLY_FINALIZE: 'reply.polling.bots.finalize',
  REPLY_FINALIZE_TARGET: 'reply.polling.bots.finalize-target',
  REPLY_PREPARE: 'reply.polling.bots.prepare-target',
  SOCIAL_BEGIN: 'reply.polling.social.begin',
  SOCIAL_DISCOVER: 'reply.polling.social.discover-workflows',
  SOCIAL_FAIL: 'reply.polling.social.fail',
  SOCIAL_FINALIZE: 'reply.polling.social.finalize',
  SOCIAL_PROCESS: 'reply.polling.social.process-trigger',
  TRENDS_DELIVER_EMAIL: 'trends.notifications.deliver-email',
  TRENDS_DELIVER_IN_APP: 'trends.notifications.deliver-in-app',
  TRENDS_DELIVER_TELEGRAM: 'trends.notifications.deliver-telegram',
  TRENDS_FINALIZE: 'trends.notifications.finalize',
  TRENDS_PREPARE: 'trends.notifications.prepare',
  TRENDS_READ_HASHTAGS: 'trends.notifications.read-hashtags',
  TRENDS_READ_SOUNDS: 'trends.notifications.read-sounds',
  TRENDS_READ_VIDEOS: 'trends.notifications.read-videos',
  TRENDS_RENDER: 'trends.notifications.render',
} as const;

type ActionId =
  (typeof AUTOMATION_ACTION_IDS)[keyof typeof AUTOMATION_ACTION_IDS];

const requestInput: WorkflowInputVariable[] = [
  {
    key: 'request',
    label: 'Workflow request',
    required: false,
    type: 'json',
  },
];

function actionNode(
  actionId: ActionId,
  id: string,
  x: number,
  y: number,
  parameters: Record<string, unknown> = {},
): WorkflowVisualNode {
  return createGenfeedActionNode({
    actionId,
    id,
    inputVariableKeys: ['request'],
    parameters,
    position: { x, y },
  });
}

function fanOutNode(
  id: string,
  childWorkflowId: string,
  y: number,
  itemInputKey = 'item',
  x = 0,
): WorkflowVisualNode {
  return createGenfeedActionNode({
    actionId: 'workflow.for-each',
    id,
    inputVariableKeys: ['request'],
    parameters: {
      childWorkflowId,
      itemInputKey,
      maxConcurrency: 1,
      mode: 'await',
    },
    position: { x, y },
  });
}

function runChildNode(
  id: string,
  childWorkflowId: string,
  y: number,
): WorkflowVisualNode {
  return createGenfeedActionNode({
    actionId: 'workflow.run-child',
    id,
    inputVariableKeys: ['request'],
    parameters: { childWorkflowId },
    position: { x: 0, y },
  });
}

function sweepDefinition(options: {
  begin: ActionId;
  canonicalId: string;
  childWorkflowId: string;
  description: string;
  discover: ActionId;
  fail: ActionId;
  finalize: ActionId;
  label: string;
}): SystemWorkflowGraphDefinition {
  const begin = actionNode(options.begin, 'begin', 0, 0);
  const discover = actionNode(options.discover, 'discover', 0, 160);
  const fanOut = fanOutNode('process-items', options.childWorkflowId, 320);
  const finalize = actionNode(options.finalize, 'finalize', 0, 480);
  const fail = actionNode(options.fail, 'release-on-failure', 280, 480);
  return {
    canonicalId: options.canonicalId,
    definition: {
      edges: [
        {
          id: 'begin-discover',
          source: begin.id,
          target: discover.id,
          targetHandle: 'state',
        },
        {
          id: 'discover-items',
          source: discover.id,
          sourceHandle: 'items',
          target: fanOut.id,
          targetHandle: 'items',
        },
        {
          id: 'discover-base',
          source: discover.id,
          sourceHandle: 'baseInput',
          target: fanOut.id,
          targetHandle: 'baseInput',
        },
        {
          id: 'begin-finalize',
          source: begin.id,
          target: finalize.id,
          targetHandle: 'state',
        },
        {
          id: 'discover-finalize',
          source: discover.id,
          target: finalize.id,
          targetHandle: 'discovery',
        },
        {
          id: 'fanout-finalize',
          source: fanOut.id,
          target: finalize.id,
          targetHandle: 'batch',
        },
        {
          id: 'begin-failure',
          source: begin.id,
          target: fail.id,
          targetHandle: 'state',
        },
        {
          id: 'fanout-failure',
          source: fanOut.id,
          sourceHandle: 'failure',
          target: fail.id,
          targetHandle: 'failure',
        },
      ],
      inputVariables: requestInput,
      nodes: [begin, discover, fanOut, finalize, fail],
    },
    description: options.description,
    label: options.label,
    resultNodeId: finalize.id,
  };
}

function singleActionChild(options: {
  actionId: ActionId;
  canonicalId: string;
  description: string;
  label: string;
}): SystemWorkflowGraphDefinition {
  const execute = actionNode(options.actionId, 'execute', 0, 0);
  return {
    canonicalId: options.canonicalId,
    definition: { edges: [], inputVariables: requestInput, nodes: [execute] },
    description: options.description,
    label: options.label,
    resultNodeId: execute.id,
  };
}

export function buildAgentProactiveWorkflowDefinition(): SystemWorkflowGraphDefinition {
  const begin = actionNode(AUTOMATION_ACTION_IDS.AGENT_BEGIN, 'begin', 0, 0);
  const discoverResets = actionNode(
    AUTOMATION_ACTION_IDS.AGENT_DISCOVER_RESETS,
    'discover-credit-resets',
    0,
    160,
  );
  const reset = fanOutNode(
    'reset-credit-windows',
    AUTOMATION_WORKFLOW_IDS.AGENT_RESET,
    320,
  );
  const discover = actionNode(
    AUTOMATION_ACTION_IDS.AGENT_DISCOVER,
    'discover-strategies',
    0,
    480,
  );
  const dispatch = fanOutNode(
    'dispatch-strategies',
    AUTOMATION_WORKFLOW_IDS.AGENT_STRATEGY,
    640,
  );
  const finalize = actionNode(
    AUTOMATION_ACTION_IDS.AGENT_FINALIZE,
    'finalize',
    0,
    800,
  );
  const fail = actionNode(
    AUTOMATION_ACTION_IDS.AGENT_FAIL,
    'release-on-failure',
    280,
    800,
  );
  return {
    canonicalId: AUTOMATION_WORKFLOW_IDS.AGENT_PROACTIVE,
    definition: {
      edges: [
        {
          id: 'begin-reset-discovery',
          source: begin.id,
          target: discoverResets.id,
          targetHandle: 'state',
        },
        {
          id: 'reset-items',
          source: discoverResets.id,
          sourceHandle: 'items',
          target: reset.id,
          targetHandle: 'items',
        },
        {
          id: 'reset-base',
          source: discoverResets.id,
          sourceHandle: 'baseInput',
          target: reset.id,
          targetHandle: 'baseInput',
        },
        {
          id: 'begin-strategy-discovery',
          source: begin.id,
          target: discover.id,
          targetHandle: 'state',
        },
        {
          id: 'resets-strategy-discovery',
          source: reset.id,
          target: discover.id,
          targetHandle: 'resetBatch',
        },
        {
          id: 'strategy-items',
          source: discover.id,
          sourceHandle: 'items',
          target: dispatch.id,
          targetHandle: 'items',
        },
        {
          id: 'strategy-base',
          source: discover.id,
          sourceHandle: 'baseInput',
          target: dispatch.id,
          targetHandle: 'baseInput',
        },
        {
          id: 'begin-finalize',
          source: begin.id,
          target: finalize.id,
          targetHandle: 'state',
        },
        {
          id: 'dispatch-finalize',
          source: dispatch.id,
          target: finalize.id,
          targetHandle: 'batch',
        },
        {
          id: 'begin-failure',
          source: begin.id,
          target: fail.id,
          targetHandle: 'state',
        },
        {
          id: 'dispatch-failure',
          source: dispatch.id,
          sourceHandle: 'failure',
          target: fail.id,
          targetHandle: 'failure',
        },
      ],
      inputVariables: requestInput,
      nodes: [begin, discoverResets, reset, discover, dispatch, finalize, fail],
    },
    description:
      'Resets due credit windows and dispatches due proactive strategies through registered child workflows.',
    label: 'Proactive Agent Strategies',
    resultNodeId: finalize.id,
  };
}

export function buildContentEngineWorkflowDefinition(): SystemWorkflowGraphDefinition {
  return sweepDefinition({
    begin: AUTOMATION_ACTION_IDS.CONTENT_ENGINE_BEGIN,
    canonicalId: AUTOMATION_WORKFLOW_IDS.CONTENT_ENGINE,
    childWorkflowId: AUTOMATION_WORKFLOW_IDS.CONTENT_ENGINE_BRAND,
    description:
      'Discovers eligible brands and plans and executes content for each brand.',
    discover: AUTOMATION_ACTION_IDS.CONTENT_ENGINE_DISCOVER,
    fail: AUTOMATION_ACTION_IDS.CONTENT_ENGINE_FAIL,
    finalize: AUTOMATION_ACTION_IDS.CONTENT_ENGINE_FINALIZE,
    label: 'Content Engine Production',
  });
}

export function buildContentPipelineWorkflowDefinition(): SystemWorkflowGraphDefinition {
  return sweepDefinition({
    begin: AUTOMATION_ACTION_IDS.CONTENT_PIPELINE_BEGIN,
    canonicalId: AUTOMATION_WORKFLOW_IDS.CONTENT_PIPELINE,
    childWorkflowId: AUTOMATION_WORKFLOW_IDS.CONTENT_PIPELINE_PERSONA,
    description:
      'Discovers due personas and processes each through the content autopilot child workflow.',
    discover: AUTOMATION_ACTION_IDS.CONTENT_PIPELINE_DISCOVER,
    fail: AUTOMATION_ACTION_IDS.CONTENT_PIPELINE_FAIL,
    finalize: AUTOMATION_ACTION_IDS.CONTENT_PIPELINE_FINALIZE,
    label: 'Content Pipeline Autopilot',
  });
}

export function buildReplyBotPollingWorkflowDefinition(): SystemWorkflowGraphDefinition {
  return sweepDefinition({
    begin: AUTOMATION_ACTION_IDS.REPLY_BEGIN,
    canonicalId: AUTOMATION_WORKFLOW_IDS.REPLY_BOTS,
    childWorkflowId: AUTOMATION_WORKFLOW_IDS.REPLY_BOT_TARGET,
    description:
      'Discovers active reply-bot credentials and polls each credential in a child workflow.',
    discover: AUTOMATION_ACTION_IDS.REPLY_DISCOVER,
    fail: AUTOMATION_ACTION_IDS.REPLY_FAIL,
    finalize: AUTOMATION_ACTION_IDS.REPLY_FINALIZE,
    label: 'Reply Bot Polling',
  });
}

export function buildSocialTriggerPollingWorkflowDefinition(): SystemWorkflowGraphDefinition {
  return sweepDefinition({
    begin: AUTOMATION_ACTION_IDS.SOCIAL_BEGIN,
    canonicalId: AUTOMATION_WORKFLOW_IDS.SOCIAL_TRIGGERS,
    childWorkflowId: AUTOMATION_WORKFLOW_IDS.SOCIAL_TRIGGER_WORKFLOW,
    description:
      'Discovers active workflows with social triggers and polls each workflow independently.',
    discover: AUTOMATION_ACTION_IDS.SOCIAL_DISCOVER,
    fail: AUTOMATION_ACTION_IDS.SOCIAL_FAIL,
    finalize: AUTOMATION_ACTION_IDS.SOCIAL_FINALIZE,
    label: 'Social Trigger Polling',
  });
}

export function buildLivestreamSessionWorkflowDefinition(): SystemWorkflowGraphDefinition {
  return sweepDefinition({
    begin: AUTOMATION_ACTION_IDS.LIVESTREAM_BEGIN,
    canonicalId: AUTOMATION_WORKFLOW_IDS.LIVESTREAM_SESSIONS,
    childWorkflowId: AUTOMATION_WORKFLOW_IDS.LIVESTREAM_SESSION,
    description:
      'Discovers active livestream sessions and processes each in a child workflow.',
    discover: AUTOMATION_ACTION_IDS.LIVESTREAM_DISCOVER,
    fail: AUTOMATION_ACTION_IDS.LIVESTREAM_FAIL,
    finalize: AUTOMATION_ACTION_IDS.LIVESTREAM_FINALIZE,
    label: 'Livestream Bot Session Processing',
  });
}

export function buildHarnessWinnerWorkflowDefinition(): SystemWorkflowGraphDefinition {
  return sweepDefinition({
    begin: AUTOMATION_ACTION_IDS.HARNESS_BEGIN,
    canonicalId: AUTOMATION_WORKFLOW_IDS.HARNESS_WINNERS,
    childWorkflowId: AUTOMATION_WORKFLOW_IDS.HARNESS_WINNERS_BRAND,
    description:
      'Discovers eligible brands and promotes each brand’s top performers in a child workflow.',
    discover: AUTOMATION_ACTION_IDS.HARNESS_DISCOVER,
    fail: AUTOMATION_ACTION_IDS.HARNESS_FAIL,
    finalize: AUTOMATION_ACTION_IDS.HARNESS_FINALIZE,
    label: 'Harness Winner Promotion',
  });
}

export function buildPaidCreativeResearchWorkflowDefinition(): SystemWorkflowGraphDefinition {
  const prepare = actionNode(
    AUTOMATION_ACTION_IDS.PAID_CREATIVE_PREPARE,
    'prepare',
    0,
    0,
  );
  const discover = actionNode(
    AUTOMATION_ACTION_IDS.PAID_CREATIVE_DISCOVER,
    'discover',
    0,
    160,
  );
  const fanOut = fanOutNode(
    'ingest-advertisers',
    AUTOMATION_WORKFLOW_IDS.PAID_CREATIVE_ADVERTISER,
    320,
  );
  const finalize = actionNode(
    AUTOMATION_ACTION_IDS.PAID_CREATIVE_FINALIZE,
    'finalize',
    0,
    480,
  );
  return {
    canonicalId: AUTOMATION_WORKFLOW_IDS.PAID_CREATIVE,
    definition: {
      edges: [
        {
          id: 'prepare-discover',
          source: prepare.id,
          target: discover.id,
          targetHandle: 'state',
        },
        {
          id: 'discover-items',
          source: discover.id,
          sourceHandle: 'items',
          target: fanOut.id,
          targetHandle: 'items',
        },
        {
          id: 'discover-base',
          source: discover.id,
          sourceHandle: 'baseInput',
          target: fanOut.id,
          targetHandle: 'baseInput',
        },
        {
          id: 'prepare-finalize',
          source: prepare.id,
          target: finalize.id,
          targetHandle: 'state',
        },
        {
          id: 'discover-finalize',
          source: discover.id,
          target: finalize.id,
          targetHandle: 'discovery',
        },
        {
          id: 'fanout-finalize',
          source: fanOut.id,
          target: finalize.id,
          targetHandle: 'batch',
        },
      ],
      inputVariables: requestInput,
      nodes: [prepare, discover, fanOut, finalize],
    },
    description:
      'Checks provider readiness, discovers watched advertisers, and ingests each advertiser independently.',
    label: 'Competitor Paid-Creative Research',
    resultNodeId: finalize.id,
  };
}

export function buildTrendNotificationWorkflowDefinition(
  cadence?: 'daily' | 'hourly' | 'weekly',
): SystemWorkflowGraphDefinition {
  const prepare = actionNode(
    AUTOMATION_ACTION_IDS.TRENDS_PREPARE,
    'prepare',
    0,
    0,
    cadence ? { request: { cadence } } : {},
  );
  const videos = actionNode(
    AUTOMATION_ACTION_IDS.TRENDS_READ_VIDEOS,
    'read-videos',
    -280,
    160,
  );
  const hashtags = actionNode(
    AUTOMATION_ACTION_IDS.TRENDS_READ_HASHTAGS,
    'read-hashtags',
    0,
    160,
  );
  const sounds = actionNode(
    AUTOMATION_ACTION_IDS.TRENDS_READ_SOUNDS,
    'read-sounds',
    280,
    160,
  );
  const render = actionNode(
    AUTOMATION_ACTION_IDS.TRENDS_RENDER,
    'render',
    0,
    320,
  );
  const telegram = actionNode(
    AUTOMATION_ACTION_IDS.TRENDS_DELIVER_TELEGRAM,
    'deliver-telegram',
    -280,
    480,
  );
  const email = actionNode(
    AUTOMATION_ACTION_IDS.TRENDS_DELIVER_EMAIL,
    'deliver-email',
    0,
    480,
  );
  const inApp = actionNode(
    AUTOMATION_ACTION_IDS.TRENDS_DELIVER_IN_APP,
    'deliver-in-app',
    280,
    480,
  );
  const finalize = actionNode(
    AUTOMATION_ACTION_IDS.TRENDS_FINALIZE,
    'finalize',
    0,
    640,
  );
  const edges: WorkflowEdge[] = [
    ...[videos, hashtags, sounds].map((reader) => ({
      id: `prepare-${reader.id}`,
      source: prepare.id,
      target: reader.id,
      targetHandle: 'state',
    })),
    {
      id: 'prepare-render',
      source: prepare.id,
      target: render.id,
      targetHandle: 'state',
    },
    {
      id: 'videos-render',
      source: videos.id,
      target: render.id,
      targetHandle: 'videos',
    },
    {
      id: 'hashtags-render',
      source: hashtags.id,
      target: render.id,
      targetHandle: 'hashtags',
    },
    {
      id: 'sounds-render',
      source: sounds.id,
      target: render.id,
      targetHandle: 'sounds',
    },
    ...[telegram, email, inApp].map((delivery) => ({
      id: `render-${delivery.id}`,
      source: render.id,
      target: delivery.id,
      targetHandle: 'state',
    })),
    {
      id: 'render-finalize',
      source: render.id,
      target: finalize.id,
      targetHandle: 'prepared',
    },
    {
      id: 'telegram-finalize',
      source: telegram.id,
      target: finalize.id,
      targetHandle: 'telegram',
    },
    {
      id: 'email-finalize',
      source: email.id,
      target: finalize.id,
      targetHandle: 'email',
    },
    {
      id: 'in-app-finalize',
      source: inApp.id,
      target: finalize.id,
      targetHandle: 'inApp',
    },
  ];
  return {
    canonicalId: AUTOMATION_WORKFLOW_IDS.TREND_NOTIFICATIONS,
    definition: {
      edges,
      inputVariables: requestInput,
      nodes: [
        prepare,
        videos,
        hashtags,
        sounds,
        render,
        telegram,
        email,
        inApp,
        finalize,
      ],
    },
    description:
      'Prepares a trend digest, renders it once, and delivers through each configured channel.',
    label: 'Trend Summary Notifications',
    resultNodeId: finalize.id,
  };
}

export function buildRestreamChatWorkflowDefinition(): SystemWorkflowGraphDefinition {
  const load = actionNode(
    AUTOMATION_ACTION_IDS.RESTREAM_LOAD,
    'load-bot',
    0,
    0,
  );
  const sync = actionNode(
    AUTOMATION_ACTION_IDS.RESTREAM_SYNC,
    'sync-chat',
    0,
    160,
  );
  const finalize = actionNode(
    AUTOMATION_ACTION_IDS.RESTREAM_FINALIZE,
    'finalize',
    0,
    320,
  );
  return {
    canonicalId: AUTOMATION_WORKFLOW_IDS.LIVESTREAM_RESTREAM,
    definition: {
      edges: [
        {
          id: 'load-sync',
          source: load.id,
          target: sync.id,
          targetHandle: 'state',
        },
        {
          id: 'load-finalize',
          source: load.id,
          target: finalize.id,
          targetHandle: 'loaded',
        },
        {
          id: 'sync-finalize',
          source: sync.id,
          target: finalize.id,
          targetHandle: 'synced',
        },
      ],
      inputVariables: requestInput,
      nodes: [load, sync, finalize],
    },
    description:
      'Loads the tenant-owned livestream bot and synchronizes its Restream chat context.',
    label: 'Restream Chat Context Ingest',
    resultNodeId: finalize.id,
  };
}

function buildContentEngineBrandWorkflowDefinition(): SystemWorkflowGraphDefinition {
  const plan = actionNode(
    AUTOMATION_ACTION_IDS.CONTENT_ENGINE_PLAN,
    'plan',
    0,
    0,
  );
  const execute = runChildNode(
    'execute-plan',
    AUTOMATION_WORKFLOW_IDS.CONTENT_ENGINE_PLAN,
    160,
  );
  return {
    canonicalId: AUTOMATION_WORKFLOW_IDS.CONTENT_ENGINE_BRAND,
    definition: {
      edges: [
        {
          id: 'plan-execute',
          source: plan.id,
          target: execute.id,
          targetHandle: 'request',
        },
      ],
      inputVariables: requestInput,
      nodes: [plan, execute],
    },
    description:
      'Plans one brand content cycle and executes its items through a registered child workflow.',
    label: 'Produce Brand Content',
    resultNodeId: execute.id,
  };
}

function buildContentEnginePlanWorkflowDefinition(): SystemWorkflowGraphDefinition {
  const prepare = actionNode(
    AUTOMATION_ACTION_IDS.CONTENT_ENGINE_PLAN_PREPARE,
    'prepare-plan',
    0,
    0,
  );
  const fanOut = fanOutNode(
    'execute-plan-items',
    AUTOMATION_WORKFLOW_IDS.CONTENT_ENGINE_ITEM,
    160,
  );
  const finalize = actionNode(
    AUTOMATION_ACTION_IDS.CONTENT_ENGINE_PLAN_FINALIZE,
    'finalize-plan',
    0,
    320,
  );
  return {
    canonicalId: AUTOMATION_WORKFLOW_IDS.CONTENT_ENGINE_PLAN,
    definition: {
      edges: [
        {
          id: 'prepare-items',
          source: prepare.id,
          sourceHandle: 'items',
          target: fanOut.id,
          targetHandle: 'items',
        },
        {
          id: 'prepare-base',
          source: prepare.id,
          sourceHandle: 'baseInput',
          target: fanOut.id,
          targetHandle: 'baseInput',
        },
        {
          id: 'prepare-finalize',
          source: prepare.id,
          target: finalize.id,
          targetHandle: 'state',
        },
        {
          id: 'items-finalize',
          source: fanOut.id,
          target: finalize.id,
          targetHandle: 'batch',
        },
      ],
      inputVariables: requestInput,
      nodes: [prepare, fanOut, finalize],
    },
    description:
      'Claims one content plan, executes each pending plan item in a child workflow, and finalizes the plan.',
    label: 'Execute Content Plan',
    resultNodeId: finalize.id,
  };
}

function buildPersonaWorkflowDefinition(): SystemWorkflowGraphDefinition {
  const prepare = actionNode(
    AUTOMATION_ACTION_IDS.CONTENT_PIPELINE_PREPARE,
    'prepare-persona',
    0,
    0,
  );
  const image = fanOutNode(
    'generate-image',
    AUTOMATION_WORKFLOW_IDS.CONTENT_PIPELINE_IMAGE,
    160,
    'request',
    -280,
  );
  const music = fanOutNode(
    'generate-music',
    AUTOMATION_WORKFLOW_IDS.CONTENT_PIPELINE_MUSIC,
    160,
    'request',
    0,
  );
  const video = fanOutNode(
    'generate-video',
    AUTOMATION_WORKFLOW_IDS.CONTENT_PIPELINE_VIDEO,
    160,
    'request',
    280,
  );
  const schedule = actionNode(
    AUTOMATION_ACTION_IDS.CONTENT_PIPELINE_SCHEDULE,
    'schedule-next-run',
    0,
    320,
  );
  const batches = [
    [image, 'imageItems', 'imageBatch'],
    [music, 'musicItems', 'musicBatch'],
    [video, 'videoItems', 'videoBatch'],
  ] as const;
  return {
    canonicalId: AUTOMATION_WORKFLOW_IDS.CONTENT_PIPELINE_PERSONA,
    definition: {
      edges: [
        ...batches.flatMap(([node, sourceHandle, targetHandle]) => [
          {
            id: `${sourceHandle}-${node.id}`,
            source: prepare.id,
            sourceHandle,
            target: node.id,
            targetHandle: 'items',
          },
          {
            id: `${node.id}-schedule`,
            source: node.id,
            target: schedule.id,
            targetHandle,
          },
        ]),
        {
          id: 'prepare-schedule',
          source: prepare.id,
          target: schedule.id,
          targetHandle: 'state',
        },
      ],
      inputVariables: requestInput,
      nodes: [prepare, image, music, video, schedule],
    },
    description:
      'Resolves one due persona, runs its typed generation and publish workflow, and schedules its next run.',
    label: 'Process Persona Autopilot',
    resultNodeId: schedule.id,
  };
}

function buildTypedPipelineWorkflowDefinition(
  canonicalId: string,
  generationActionId:
    | 'content.pipeline.generate-image'
    | 'content.pipeline.generate-music'
    | 'content.pipeline.generate-video',
  label: string,
): SystemWorkflowGraphDefinition {
  const context = createGenfeedActionNode({
    actionId: 'content.pipeline.resolve-context',
    id: 'resolve-context',
    inputVariableKeys: ['request'],
    position: { x: 0, y: 0 },
  });
  const generate = createGenfeedActionNode({
    actionId: generationActionId,
    id: 'generate',
    inputVariableKeys: ['request'],
    position: { x: 0, y: 160 },
  });
  const publish = createGenfeedActionNode({
    actionId: 'content.pipeline.publish',
    id: 'publish',
    inputVariableKeys: ['request'],
    position: { x: 0, y: 320 },
  });
  return {
    canonicalId,
    definition: {
      edges: [
        {
          id: 'context-generate',
          source: context.id,
          target: generate.id,
          targetHandle: 'pipelineContext',
        },
        {
          id: 'context-publish',
          source: context.id,
          target: publish.id,
          targetHandle: 'pipelineContext',
        },
        {
          id: 'generate-publish',
          source: generate.id,
          target: publish.id,
          targetHandle: 'stepOutcome0',
        },
      ],
      inputVariables: requestInput,
      nodes: [context, generate, publish],
    },
    description: `${label} and publishes one persona content item.`,
    label,
    resultNodeId: publish.id,
  };
}

function buildReplyBotTargetWorkflowDefinition(): SystemWorkflowGraphDefinition {
  const prepare = actionNode(
    AUTOMATION_ACTION_IDS.REPLY_PREPARE,
    'prepare-target',
    0,
    0,
  );
  const execute = runChildNode(
    'process-reply-bots',
    REPLY_BOT_WORKFLOW_IDS.ORGANIZATION,
    160,
  );
  const finalize = actionNode(
    AUTOMATION_ACTION_IDS.REPLY_FINALIZE_TARGET,
    'finalize-target',
    0,
    320,
  );
  return {
    canonicalId: AUTOMATION_WORKFLOW_IDS.REPLY_BOT_TARGET,
    definition: {
      edges: [
        {
          id: 'prepare-execute',
          source: prepare.id,
          target: execute.id,
          targetHandle: 'request',
        },
        {
          id: 'execute-finalize',
          source: execute.id,
          target: finalize.id,
          targetHandle: 'results',
        },
      ],
      inputVariables: requestInput,
      nodes: [prepare, execute, finalize],
    },
    description:
      'Adapts one credential target and runs the registered reply-bot workflow graph.',
    label: 'Poll Reply Bot Target',
    resultNodeId: finalize.id,
  };
}

function buildLivestreamSessionChildWorkflowDefinition(): SystemWorkflowGraphDefinition {
  const load = actionNode(
    AUTOMATION_ACTION_IDS.LIVESTREAM_SESSION_LOAD,
    'load-session',
    0,
    0,
  );
  const restream = actionNode(
    AUTOMATION_ACTION_IDS.LIVESTREAM_SESSION_SYNC_RESTREAM,
    'sync-restream',
    0,
    160,
  );
  const discover = actionNode(
    AUTOMATION_ACTION_IDS.LIVESTREAM_SESSION_DISCOVER_TARGETS,
    'discover-targets',
    0,
    320,
  );
  const deliver = fanOutNode(
    'deliver-targets',
    AUTOMATION_WORKFLOW_IDS.LIVESTREAM_TARGET,
    480,
  );
  const finalize = actionNode(
    AUTOMATION_ACTION_IDS.LIVESTREAM_SESSION_FINALIZE,
    'finalize-session',
    0,
    640,
  );
  return {
    canonicalId: AUTOMATION_WORKFLOW_IDS.LIVESTREAM_SESSION,
    definition: {
      edges: [
        {
          id: 'load-restream',
          source: load.id,
          target: restream.id,
          targetHandle: 'state',
        },
        {
          id: 'restream-discover',
          source: restream.id,
          target: discover.id,
          targetHandle: 'state',
        },
        {
          id: 'target-items',
          source: discover.id,
          sourceHandle: 'items',
          target: deliver.id,
          targetHandle: 'items',
        },
        {
          id: 'target-base',
          source: discover.id,
          sourceHandle: 'baseInput',
          target: deliver.id,
          targetHandle: 'baseInput',
        },
        {
          id: 'discover-finalize',
          source: discover.id,
          target: finalize.id,
          targetHandle: 'state',
        },
        {
          id: 'deliver-finalize',
          source: deliver.id,
          target: finalize.id,
          targetHandle: 'batch',
        },
      ],
      inputVariables: requestInput,
      nodes: [load, restream, discover, deliver, finalize],
    },
    description:
      'Loads one active livestream session, synchronizes Restream, discovers eligible targets, and delivers through child workflows.',
    label: 'Process Livestream Session',
    resultNodeId: finalize.id,
  };
}

function buildHarnessWinnerBrandWorkflowDefinition(): SystemWorkflowGraphDefinition {
  const prepare = actionNode(
    AUTOMATION_ACTION_IDS.HARNESS_PREPARE_BRAND,
    'prepare-brand',
    0,
    0,
  );
  const promote = fanOutNode(
    'promote-items',
    AUTOMATION_WORKFLOW_IDS.HARNESS_WINNERS_ITEM,
    160,
  );
  const finalize = actionNode(
    AUTOMATION_ACTION_IDS.HARNESS_FINALIZE_BRAND,
    'finalize-brand',
    0,
    320,
  );
  return {
    canonicalId: AUTOMATION_WORKFLOW_IDS.HARNESS_WINNERS_BRAND,
    definition: {
      edges: [
        {
          id: 'prepare-items',
          source: prepare.id,
          sourceHandle: 'items',
          target: promote.id,
          targetHandle: 'items',
        },
        {
          id: 'prepare-base',
          source: prepare.id,
          sourceHandle: 'baseInput',
          target: promote.id,
          targetHandle: 'baseInput',
        },
        {
          id: 'prepare-finalize',
          source: prepare.id,
          target: finalize.id,
          targetHandle: 'state',
        },
        {
          id: 'promote-finalize',
          source: promote.id,
          target: finalize.id,
          targetHandle: 'batch',
        },
      ],
      inputVariables: requestInput,
      nodes: [prepare, promote, finalize],
    },
    description:
      'Discovers ranked winners for one brand and promotes each through a child workflow.',
    label: 'Promote Brand Winners',
    resultNodeId: finalize.id,
  };
}

export const AUTOMATION_CHILD_WORKFLOWS = [
  singleActionChild({
    actionId: AUTOMATION_ACTION_IDS.AGENT_RESET,
    canonicalId: AUTOMATION_WORKFLOW_IDS.AGENT_RESET,
    description: 'Resets one due proactive strategy credit window.',
    label: 'Reset Strategy Credit Window',
  }),
  singleActionChild({
    actionId: AUTOMATION_ACTION_IDS.AGENT_DISPATCH,
    canonicalId: AUTOMATION_WORKFLOW_IDS.AGENT_STRATEGY,
    description: 'Dispatches one due proactive agent strategy.',
    label: 'Dispatch Proactive Strategy',
  }),
  buildContentEngineBrandWorkflowDefinition(),
  buildContentEnginePlanWorkflowDefinition(),
  singleActionChild({
    actionId: AUTOMATION_ACTION_IDS.CONTENT_ENGINE_EXECUTE_ITEM,
    canonicalId: AUTOMATION_WORKFLOW_IDS.CONTENT_ENGINE_ITEM,
    description: 'Executes one pending content-plan item.',
    label: 'Execute Content Plan Item',
  }),
  buildPersonaWorkflowDefinition(),
  buildTypedPipelineWorkflowDefinition(
    AUTOMATION_WORKFLOW_IDS.CONTENT_PIPELINE_IMAGE,
    'content.pipeline.generate-image',
    'Generate Persona Image',
  ),
  buildTypedPipelineWorkflowDefinition(
    AUTOMATION_WORKFLOW_IDS.CONTENT_PIPELINE_MUSIC,
    'content.pipeline.generate-music',
    'Generate Persona Music',
  ),
  buildTypedPipelineWorkflowDefinition(
    AUTOMATION_WORKFLOW_IDS.CONTENT_PIPELINE_VIDEO,
    'content.pipeline.generate-video',
    'Generate Persona Video',
  ),
  buildReplyBotTargetWorkflowDefinition(),
  singleActionChild({
    actionId: AUTOMATION_ACTION_IDS.SOCIAL_PROCESS,
    canonicalId: AUTOMATION_WORKFLOW_IDS.SOCIAL_TRIGGER_WORKFLOW,
    description: 'Checks and persists one social trigger node.',
    label: 'Poll Social Trigger',
  }),
  buildLivestreamSessionChildWorkflowDefinition(),
  singleActionChild({
    actionId: AUTOMATION_ACTION_IDS.LIVESTREAM_TARGET_DELIVER,
    canonicalId: AUTOMATION_WORKFLOW_IDS.LIVESTREAM_TARGET,
    description: 'Delivers one eligible livestream target message.',
    label: 'Deliver Livestream Target',
  }),
  buildHarnessWinnerBrandWorkflowDefinition(),
  singleActionChild({
    actionId: AUTOMATION_ACTION_IDS.HARNESS_PROMOTE_ITEM,
    canonicalId: AUTOMATION_WORKFLOW_IDS.HARNESS_WINNERS_ITEM,
    description: 'Promotes one ranked content performer.',
    label: 'Promote Content Winner',
  }),
  singleActionChild({
    actionId: AUTOMATION_ACTION_IDS.PAID_CREATIVE_INGEST,
    canonicalId: AUTOMATION_WORKFLOW_IDS.PAID_CREATIVE_ADVERTISER,
    description: 'Ingests paid creative research for one watched advertiser.',
    label: 'Ingest Advertiser Research',
  }),
] satisfies SystemWorkflowGraphDefinition[];

export const AUTOMATION_PARENT_WORKFLOWS = [
  buildAgentProactiveWorkflowDefinition(),
  buildContentEngineWorkflowDefinition(),
  buildContentPipelineWorkflowDefinition(),
  buildReplyBotPollingWorkflowDefinition(),
  buildSocialTriggerPollingWorkflowDefinition(),
  buildTrendNotificationWorkflowDefinition(),
  buildLivestreamSessionWorkflowDefinition(),
  buildRestreamChatWorkflowDefinition(),
  buildHarnessWinnerWorkflowDefinition(),
  buildPaidCreativeResearchWorkflowDefinition(),
] satisfies SystemWorkflowGraphDefinition[];
