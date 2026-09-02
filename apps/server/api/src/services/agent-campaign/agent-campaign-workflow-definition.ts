import type {
  WorkflowEdge,
  WorkflowVisualNode,
} from '@api/collections/workflows/schemas/workflow.schema';
import type { SystemWorkflowGraphDefinition } from '@api/collections/workflows/system-workflow-definition';
import { createGenfeedActionNode } from '@genfeedai/actions';

export const AGENT_CAMPAIGN_WORKFLOW_IDS = {
  ANNOTATE_ORCHESTRATION: 'agent-campaign.annotate-orchestration-run',
  DISPATCH_ORCHESTRATION: 'agent-campaign.dispatch-orchestration-run',
  DISPATCH_TRIGGER_GROUP: 'agent-campaign.dispatch-trigger-group',
  DISPATCH_TRIGGER_RUN: 'agent-campaign.dispatch-trigger-run',
  EVALUATE_TRIGGERS: 'agent-campaign.evaluate-triggers',
  EXTRACT_MEMORY: 'agent-campaign.extract-memory',
  ORCHESTRATE: 'agent-campaign.orchestrate',
  PERSIST_TRIGGER_RECOMMENDATION:
    'agent-campaign.persist-trigger-recommendation',
  RUN_DUE_ORCHESTRATIONS: 'agent-campaign.run-due-orchestrations',
  RUN_TRIGGER_EVALUATIONS: 'agent-campaign.run-trigger-evaluations',
} as const;

export const AGENT_CAMPAIGN_ACTION_IDS = {
  MEMORY_LOAD_WINNERS: 'agent-campaign.memory.load-winners',
  MEMORY_PERSIST: 'agent-campaign.memory.persist',
  ORCHESTRATION_ANNOTATE: 'agent-campaign.orchestration.annotate-run',
  ORCHESTRATION_CAPTURE_MEMORY: 'agent-campaign.orchestration.capture-memory',
  ORCHESTRATION_DISPATCH: 'agent-campaign.orchestration.dispatch-run',
  ORCHESTRATION_FINALIZE: 'agent-campaign.orchestration.finalize',
  ORCHESTRATION_LOAD_CONTEXT: 'agent-campaign.orchestration.load-context',
  ORCHESTRATION_PLAN: 'agent-campaign.orchestration.plan',
  ORCHESTRATION_SUMMARIZE: 'agent-campaign.orchestration.summarize',
  TRIGGERS_ANNOTATE_RUN: 'agent-campaign.triggers.annotate-run',
  TRIGGERS_DISCOVER_DUE: 'agent-campaign.triggers.discover-due',
  TRIGGERS_DISPATCH_RUN: 'agent-campaign.triggers.dispatch-run',
  TRIGGERS_FINALIZE: 'agent-campaign.triggers.finalize',
  TRIGGERS_FINALIZE_GROUP: 'agent-campaign.triggers.finalize-group',
  TRIGGERS_LOAD_CONTEXT: 'agent-campaign.triggers.load-context',
  TRIGGERS_PERSIST_RECOMMENDATION:
    'agent-campaign.triggers.persist-recommendation',
  TRIGGERS_PLAN_RECOMMENDATIONS: 'agent-campaign.triggers.plan-recommendations',
  TRIGGERS_PLAN_DISPATCHES: 'agent-campaign.triggers.plan-dispatches',
  TRIGGERS_PLAN_GROUPS: 'agent-campaign.triggers.plan-groups',
  ORCHESTRATION_DISCOVER_DUE: 'agent-campaign.orchestration.discover-due',
} as const;

type AgentCampaignActionId =
  (typeof AGENT_CAMPAIGN_ACTION_IDS)[keyof typeof AGENT_CAMPAIGN_ACTION_IDS];

function actionNode(
  actionId: AgentCampaignActionId,
  id: string,
  y: number,
): WorkflowVisualNode {
  return createGenfeedActionNode({
    actionId,
    id,
    inputVariableKeys: ['request'],
    position: { x: 0, y },
  });
}

function definition(
  canonicalId: string,
  label: string,
  description: string,
  nodes: WorkflowVisualNode[],
  edges: WorkflowEdge[],
  resultNodeId: string,
  requiresRequest = true,
): SystemWorkflowGraphDefinition {
  return {
    canonicalId,
    definition: {
      edges,
      inputVariables: requiresRequest
        ? [
            {
              key: 'request',
              label: `${label} request`,
              required: true,
              type: 'json',
            },
          ]
        : [],
      nodes,
    },
    description,
    label,
    resultNodeId,
    version: 1,
  };
}

function childActionWorkflow(
  canonicalId: string,
  actionId: AgentCampaignActionId,
  label: string,
): SystemWorkflowGraphDefinition {
  const node = actionNode(actionId, 'execute', 0);
  return definition(canonicalId, label, label, [node], [], node.id);
}

export function buildAgentCampaignOrchestrationWorkflowDefinition(): SystemWorkflowGraphDefinition {
  const load = actionNode(
    AGENT_CAMPAIGN_ACTION_IDS.ORCHESTRATION_LOAD_CONTEXT,
    'load-context',
    0,
  );
  const plan = actionNode(
    AGENT_CAMPAIGN_ACTION_IDS.ORCHESTRATION_PLAN,
    'plan-dispatches',
    160,
  );
  const dispatch = createGenfeedActionNode({
    actionId: 'workflow.for-each',
    id: 'dispatch-runs',
    parameters: {
      childWorkflowId: AGENT_CAMPAIGN_WORKFLOW_IDS.DISPATCH_ORCHESTRATION,
      itemInputKey: 'request',
      maxConcurrency: 4,
      mode: 'await',
    },
    position: { x: 0, y: 320 },
  });
  const summarize = actionNode(
    AGENT_CAMPAIGN_ACTION_IDS.ORCHESTRATION_SUMMARIZE,
    'summarize',
    480,
  );
  const capture = actionNode(
    AGENT_CAMPAIGN_ACTION_IDS.ORCHESTRATION_CAPTURE_MEMORY,
    'capture-memory',
    640,
  );
  const annotate = createGenfeedActionNode({
    actionId: 'workflow.for-each',
    id: 'annotate-runs',
    parameters: {
      childWorkflowId: AGENT_CAMPAIGN_WORKFLOW_IDS.ANNOTATE_ORCHESTRATION,
      itemInputKey: 'request',
      maxConcurrency: 4,
      mode: 'await',
    },
    position: { x: 0, y: 800 },
  });
  const finalize = actionNode(
    AGENT_CAMPAIGN_ACTION_IDS.ORCHESTRATION_FINALIZE,
    'finalize-cycle',
    960,
  );
  const loadWinners = actionNode(
    AGENT_CAMPAIGN_ACTION_IDS.MEMORY_LOAD_WINNERS,
    'load-winners',
    960,
  );
  const persistMemory = actionNode(
    AGENT_CAMPAIGN_ACTION_IDS.MEMORY_PERSIST,
    'persist-memory',
    1120,
  );
  return definition(
    AGENT_CAMPAIGN_WORKFLOW_IDS.ORCHESTRATE,
    'Run Agent Campaign Orchestration',
    'Loads campaign context, fans out atomic agent dispatches, records memory and run metadata, and finalizes the cycle.',
    [
      load,
      plan,
      dispatch,
      summarize,
      capture,
      annotate,
      loadWinners,
      persistMemory,
      finalize,
    ],
    [
      {
        id: 'load-plan',
        source: load.id,
        target: plan.id,
        targetHandle: 'state',
      },
      {
        id: 'plan-dispatch',
        source: plan.id,
        sourceHandle: 'items',
        target: dispatch.id,
        targetHandle: 'items',
      },
      {
        id: 'plan-summarize',
        source: plan.id,
        target: summarize.id,
        targetHandle: 'state',
      },
      {
        id: 'dispatch-summarize',
        source: dispatch.id,
        target: summarize.id,
        targetHandle: 'batch',
      },
      {
        id: 'summarize-capture',
        source: summarize.id,
        target: capture.id,
        targetHandle: 'state',
      },
      {
        id: 'capture-annotate',
        source: capture.id,
        sourceHandle: 'annotationItems',
        target: annotate.id,
        targetHandle: 'items',
      },
      {
        id: 'capture-finalize',
        source: capture.id,
        target: finalize.id,
        targetHandle: 'state',
      },
      {
        id: 'capture-load-winners',
        source: capture.id,
        target: loadWinners.id,
        targetHandle: 'orchestration',
      },
      {
        id: 'winner-context-to-persist',
        source: loadWinners.id,
        target: persistMemory.id,
        targetHandle: 'state',
      },
      {
        id: 'memory-to-finalize',
        source: persistMemory.id,
        target: finalize.id,
        targetHandle: 'memory',
      },
      {
        id: 'annotate-finalize',
        source: annotate.id,
        target: finalize.id,
        targetHandle: 'annotations',
      },
    ],
    finalize.id,
  );
}

function sweepWorkflow(
  canonicalId: string,
  childWorkflowId: string,
  discoverActionId: AgentCampaignActionId,
  label: string,
  description: string,
): SystemWorkflowGraphDefinition {
  const discover = actionNode(discoverActionId, 'discover-campaigns', 0);
  const execute = createGenfeedActionNode({
    actionId: 'workflow.for-each',
    id: 'execute-campaigns',
    parameters: {
      childWorkflowId,
      itemInputKey: 'request',
      maxConcurrency: 4,
      mode: 'await',
    },
    position: { x: 0, y: 160 },
  });
  return definition(
    canonicalId,
    label,
    description,
    [discover, execute],
    [
      {
        id: 'discovered-campaigns-to-execution',
        source: discover.id,
        sourceHandle: 'items',
        target: execute.id,
        targetHandle: 'items',
      },
    ],
    execute.id,
    false,
  );
}

export function buildAgentCampaignDueOrchestrationWorkflowDefinition(): SystemWorkflowGraphDefinition {
  return sweepWorkflow(
    AGENT_CAMPAIGN_WORKFLOW_IDS.RUN_DUE_ORCHESTRATIONS,
    AGENT_CAMPAIGN_WORKFLOW_IDS.ORCHESTRATE,
    AGENT_CAMPAIGN_ACTION_IDS.ORCHESTRATION_DISCOVER_DUE,
    'Run Due Agent Campaign Orchestrations',
    'Discovers due tenant campaigns and fans each one into the immutable orchestration workflow.',
  );
}

export function buildAgentCampaignTriggerSweepWorkflowDefinition(): SystemWorkflowGraphDefinition {
  return sweepWorkflow(
    AGENT_CAMPAIGN_WORKFLOW_IDS.RUN_TRIGGER_EVALUATIONS,
    AGENT_CAMPAIGN_WORKFLOW_IDS.EVALUATE_TRIGGERS,
    AGENT_CAMPAIGN_ACTION_IDS.TRIGGERS_DISCOVER_DUE,
    'Run Agent Campaign Trigger Evaluations',
    'Discovers eligible tenant campaigns and fans each one into the immutable trigger-evaluation workflow.',
  );
}

export function buildAgentCampaignMemoryWorkflowDefinition(): SystemWorkflowGraphDefinition {
  const load = actionNode(
    AGENT_CAMPAIGN_ACTION_IDS.MEMORY_LOAD_WINNERS,
    'load-winners',
    0,
  );
  const persist = actionNode(
    AGENT_CAMPAIGN_ACTION_IDS.MEMORY_PERSIST,
    'persist-memory',
    160,
  );
  return definition(
    AGENT_CAMPAIGN_WORKFLOW_IDS.EXTRACT_MEMORY,
    'Extract Agent Campaign Winner Memory',
    'Loads top campaign content and persists one winner-memory record when evidence exists.',
    [load, persist],
    [
      {
        id: 'winner-context-to-memory',
        source: load.id,
        target: persist.id,
        targetHandle: 'state',
      },
    ],
    persist.id,
  );
}

export function buildAgentCampaignTriggerWorkflowDefinition(): SystemWorkflowGraphDefinition {
  const load = actionNode(
    AGENT_CAMPAIGN_ACTION_IDS.TRIGGERS_LOAD_CONTEXT,
    'load-trigger-context',
    0,
  );
  const planRecommendations = actionNode(
    AGENT_CAMPAIGN_ACTION_IDS.TRIGGERS_PLAN_RECOMMENDATIONS,
    'plan-recommendations',
    160,
  );
  const persistRecommendations = createGenfeedActionNode({
    actionId: 'workflow.for-each',
    id: 'persist-recommendations',
    parameters: {
      childWorkflowId:
        AGENT_CAMPAIGN_WORKFLOW_IDS.PERSIST_TRIGGER_RECOMMENDATION,
      itemInputKey: 'request',
      maxConcurrency: 4,
      mode: 'await',
    },
    position: { x: 0, y: 320 },
  });
  const plan = actionNode(
    AGENT_CAMPAIGN_ACTION_IDS.TRIGGERS_PLAN_GROUPS,
    'plan-trigger-groups',
    480,
  );
  const dispatch = createGenfeedActionNode({
    actionId: 'workflow.for-each',
    id: 'dispatch-trigger-groups',
    parameters: {
      childWorkflowId: AGENT_CAMPAIGN_WORKFLOW_IDS.DISPATCH_TRIGGER_GROUP,
      itemInputKey: 'request',
      maxConcurrency: 3,
      mode: 'await',
    },
    position: { x: 0, y: 640 },
  });
  const finalize = actionNode(
    AGENT_CAMPAIGN_ACTION_IDS.TRIGGERS_FINALIZE,
    'finalize-trigger-evaluation',
    800,
  );
  return definition(
    AGENT_CAMPAIGN_WORKFLOW_IDS.EVALUATE_TRIGGERS,
    'Evaluate Agent Campaign Triggers',
    'Loads trigger signals, persists posting recommendations, fans out eligible trigger groups, and aggregates dispatches.',
    [
      load,
      planRecommendations,
      persistRecommendations,
      plan,
      dispatch,
      finalize,
    ],
    [
      {
        id: 'load-plan-recommendations',
        source: load.id,
        target: planRecommendations.id,
        targetHandle: 'state',
      },
      {
        id: 'plan-persist-recommendations',
        source: planRecommendations.id,
        sourceHandle: 'items',
        target: persistRecommendations.id,
        targetHandle: 'items',
      },
      {
        id: 'recommendations-plan-groups',
        source: planRecommendations.id,
        target: plan.id,
        targetHandle: 'state',
      },
      {
        id: 'persisted-plan-groups',
        source: persistRecommendations.id,
        target: plan.id,
        targetHandle: 'recommendations',
      },
      {
        id: 'plan-dispatch-groups',
        source: plan.id,
        sourceHandle: 'items',
        target: dispatch.id,
        targetHandle: 'items',
      },
      {
        id: 'plan-finalize',
        source: plan.id,
        target: finalize.id,
        targetHandle: 'state',
      },
      {
        id: 'groups-finalize',
        source: dispatch.id,
        target: finalize.id,
        targetHandle: 'batch',
      },
    ],
    finalize.id,
  );
}

export function buildAgentCampaignTriggerGroupWorkflowDefinition(): SystemWorkflowGraphDefinition {
  const plan = actionNode(
    AGENT_CAMPAIGN_ACTION_IDS.TRIGGERS_PLAN_DISPATCHES,
    'plan-trigger-dispatches',
    0,
  );
  const dispatch = createGenfeedActionNode({
    actionId: 'workflow.for-each',
    id: 'dispatch-trigger-runs',
    parameters: {
      childWorkflowId: AGENT_CAMPAIGN_WORKFLOW_IDS.DISPATCH_TRIGGER_RUN,
      itemInputKey: 'request',
      maxConcurrency: 4,
      mode: 'await',
    },
    position: { x: 0, y: 160 },
  });
  const finalize = actionNode(
    AGENT_CAMPAIGN_ACTION_IDS.TRIGGERS_FINALIZE_GROUP,
    'finalize-trigger-group',
    320,
  );
  return definition(
    AGENT_CAMPAIGN_WORKFLOW_IDS.DISPATCH_TRIGGER_GROUP,
    'Dispatch Campaign Trigger Group',
    'Plans bounded per-strategy dispatches, executes child run workflows, and summarizes one trigger group.',
    [plan, dispatch, finalize],
    [
      {
        id: 'plan-trigger-runs',
        source: plan.id,
        sourceHandle: 'items',
        target: dispatch.id,
        targetHandle: 'items',
      },
      {
        id: 'plan-group-finalize',
        source: plan.id,
        target: finalize.id,
        targetHandle: 'state',
      },
      {
        id: 'runs-group-finalize',
        source: dispatch.id,
        target: finalize.id,
        targetHandle: 'batch',
      },
    ],
    finalize.id,
  );
}

export function buildAgentCampaignTriggerRunWorkflowDefinition(): SystemWorkflowGraphDefinition {
  const dispatch = actionNode(
    AGENT_CAMPAIGN_ACTION_IDS.TRIGGERS_DISPATCH_RUN,
    'dispatch-trigger-run',
    0,
  );
  const annotate = actionNode(
    AGENT_CAMPAIGN_ACTION_IDS.TRIGGERS_ANNOTATE_RUN,
    'annotate-trigger-run',
    160,
  );
  return definition(
    AGENT_CAMPAIGN_WORKFLOW_IDS.DISPATCH_TRIGGER_RUN,
    'Dispatch One Campaign Trigger Run',
    'Starts and annotates one trigger-driven agent run.',
    [dispatch, annotate],
    [
      {
        id: 'dispatch-trigger-annotate',
        source: dispatch.id,
        target: annotate.id,
        targetHandle: 'state',
      },
    ],
    annotate.id,
  );
}

export const AGENT_CAMPAIGN_WORKFLOW_DEFINITIONS = [
  childActionWorkflow(
    AGENT_CAMPAIGN_WORKFLOW_IDS.PERSIST_TRIGGER_RECOMMENDATION,
    AGENT_CAMPAIGN_ACTION_IDS.TRIGGERS_PERSIST_RECOMMENDATION,
    'Persist One Campaign Posting Recommendation',
  ),
  childActionWorkflow(
    AGENT_CAMPAIGN_WORKFLOW_IDS.DISPATCH_ORCHESTRATION,
    AGENT_CAMPAIGN_ACTION_IDS.ORCHESTRATION_DISPATCH,
    'Dispatch One Campaign Agent Run',
  ),
  childActionWorkflow(
    AGENT_CAMPAIGN_WORKFLOW_IDS.ANNOTATE_ORCHESTRATION,
    AGENT_CAMPAIGN_ACTION_IDS.ORCHESTRATION_ANNOTATE,
    'Annotate One Campaign Agent Run',
  ),
  buildAgentCampaignOrchestrationWorkflowDefinition(),
  buildAgentCampaignMemoryWorkflowDefinition(),
  buildAgentCampaignTriggerRunWorkflowDefinition(),
  buildAgentCampaignTriggerGroupWorkflowDefinition(),
  buildAgentCampaignTriggerWorkflowDefinition(),
  buildAgentCampaignDueOrchestrationWorkflowDefinition(),
  buildAgentCampaignTriggerSweepWorkflowDefinition(),
] satisfies SystemWorkflowGraphDefinition[];

export function findAgentCampaignWorkflowDefinition(
  canonicalId: string,
): SystemWorkflowGraphDefinition {
  const workflow = AGENT_CAMPAIGN_WORKFLOW_DEFINITIONS.find(
    (definition) => definition.canonicalId === canonicalId,
  );
  if (!workflow) {
    throw new Error(`Unknown agent campaign workflow: ${canonicalId}`);
  }
  return workflow;
}
