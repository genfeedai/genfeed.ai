import type {
  WorkflowEdge,
  WorkflowVisualNode,
} from '@api/collections/workflows/schemas/workflow.schema';
import type { SystemWorkflowGraphDefinition } from '@api/collections/workflows/system-workflow-definition';
import { createGenfeedActionNode } from '@genfeedai/actions';

export type AiInfluencerWorkflowRequest = {
  aspectRatio?: string;
  captionOverride?: string;
  organizationId: string;
  personaSlug: string;
  platforms: string[];
  promptOverride?: string;
};

export const AI_INFLUENCER_WORKFLOW_IDS = {
  DAILY_POST: 'ai-influencer.daily-post',
  DAILY_POSTS: 'ai-influencer.daily-posts',
  GENERATE_POST: 'ai-influencer.generate-post',
  GENERATE_VIDEO: 'ai-influencer.generate-video',
  GENERATE_VOICE: 'ai-influencer.generate-voice',
  PUBLISH_PLATFORM: 'ai-influencer.publish-platform',
} as const;

export const AI_INFLUENCER_ACTION_IDS = {
  CAPTION_GENERATE: 'ai-influencer.caption.generate',
  DAILY_DISCOVER: 'ai-influencer.daily.discover',
  DAILY_FINALIZE: 'ai-influencer.daily.finalize',
  DAILY_MARK_RUN: 'ai-influencer.daily.mark-run',
  DAILY_PREPARE: 'ai-influencer.daily.prepare',
  IMAGE_GENERATE: 'ai-influencer.image.generate',
  IMAGE_PREPARE: 'ai-influencer.image.prepare',
  INGREDIENT_CREATE: 'ai-influencer.ingredient.create',
  PERSONA_LOAD: 'ai-influencer.persona.load',
  PLATFORM_PUBLISH: 'ai-influencer.platform.publish',
  POST_FINALIZE: 'ai-influencer.post.finalize',
  PUBLISH_PLAN: 'ai-influencer.publish.plan',
  VIDEO_GENERATE: 'ai-influencer.video.generate',
  VIDEO_PLAN: 'ai-influencer.video.plan',
  VOICE_GENERATE: 'ai-influencer.voice.generate',
} as const;

type AiInfluencerActionId =
  (typeof AI_INFLUENCER_ACTION_IDS)[keyof typeof AI_INFLUENCER_ACTION_IDS];

function actionNode(
  actionId: AiInfluencerActionId,
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

function fanOutNode(
  id: string,
  childWorkflowId: string,
  y: number,
  maxConcurrency = 4,
): WorkflowVisualNode {
  return createGenfeedActionNode({
    actionId: 'workflow.for-each',
    id,
    parameters: {
      childWorkflowId,
      itemInputKey: 'request',
      maxConcurrency,
      mode: 'await',
    },
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

export function buildAiInfluencerGeneratePostWorkflowDefinition(): SystemWorkflowGraphDefinition {
  const load = actionNode(
    AI_INFLUENCER_ACTION_IDS.PERSONA_LOAD,
    'load-persona',
    0,
  );
  const caption = actionNode(
    AI_INFLUENCER_ACTION_IDS.CAPTION_GENERATE,
    'generate-caption',
    140,
  );
  const prepareImage = actionNode(
    AI_INFLUENCER_ACTION_IDS.IMAGE_PREPARE,
    'prepare-image',
    280,
  );
  const generateImage = actionNode(
    AI_INFLUENCER_ACTION_IDS.IMAGE_GENERATE,
    'generate-image',
    420,
  );
  const createIngredient = actionNode(
    AI_INFLUENCER_ACTION_IDS.INGREDIENT_CREATE,
    'create-ingredient',
    560,
  );
  const planVideo = actionNode(
    AI_INFLUENCER_ACTION_IDS.VIDEO_PLAN,
    'plan-video',
    700,
  );
  const voice = fanOutNode(
    'generate-voice',
    AI_INFLUENCER_WORKFLOW_IDS.GENERATE_VOICE,
    840,
    1,
  );
  const video = fanOutNode(
    'generate-video',
    AI_INFLUENCER_WORKFLOW_IDS.GENERATE_VIDEO,
    840,
    1,
  );
  const planPublish = actionNode(
    AI_INFLUENCER_ACTION_IDS.PUBLISH_PLAN,
    'plan-publish',
    980,
  );
  const publish = fanOutNode(
    'publish-platforms',
    AI_INFLUENCER_WORKFLOW_IDS.PUBLISH_PLATFORM,
    1120,
  );
  const finalize = actionNode(
    AI_INFLUENCER_ACTION_IDS.POST_FINALIZE,
    'finalize-post',
    1260,
  );

  return definition(
    AI_INFLUENCER_WORKFLOW_IDS.GENERATE_POST,
    'Generate AI Influencer Post',
    'Loads one tenant persona, generates its media, publishes through per-platform child workflows, and returns the aggregate result.',
    [
      load,
      caption,
      prepareImage,
      generateImage,
      createIngredient,
      planVideo,
      voice,
      video,
      planPublish,
      publish,
      finalize,
    ],
    [
      ...sequenceEdges([
        load.id,
        caption.id,
        prepareImage.id,
        generateImage.id,
        createIngredient.id,
        planVideo.id,
      ]),
      {
        id: 'voice-items',
        source: planVideo.id,
        sourceHandle: 'voiceItems',
        target: voice.id,
        targetHandle: 'items',
      },
      {
        id: 'video-items',
        source: planVideo.id,
        sourceHandle: 'videoItems',
        target: video.id,
        targetHandle: 'items',
      },
      {
        id: 'post-state-to-publish-plan',
        source: planVideo.id,
        target: planPublish.id,
        targetHandle: 'state',
      },
      {
        id: 'voice-result-to-publish-plan',
        source: voice.id,
        target: planPublish.id,
        targetHandle: 'voiceBatch',
      },
      {
        id: 'video-result-to-publish-plan',
        source: video.id,
        target: planPublish.id,
        targetHandle: 'videoBatch',
      },
      {
        id: 'publish-items',
        source: planPublish.id,
        sourceHandle: 'items',
        target: publish.id,
        targetHandle: 'items',
      },
      {
        id: 'post-state-to-finalize',
        source: planPublish.id,
        target: finalize.id,
        targetHandle: 'state',
      },
      {
        id: 'publish-results-to-finalize',
        source: publish.id,
        target: finalize.id,
        targetHandle: 'publishBatch',
      },
    ],
    finalize.id,
  );
}

function singleActionWorkflow(
  canonicalId: string,
  actionId: AiInfluencerActionId,
  label: string,
  description: string,
): SystemWorkflowGraphDefinition {
  const action = actionNode(actionId, 'execute', 0);
  return definition(canonicalId, label, description, [action], [], action.id);
}

export function buildAiInfluencerDailyPostWorkflowDefinition(): SystemWorkflowGraphDefinition {
  const prepare = actionNode(
    AI_INFLUENCER_ACTION_IDS.DAILY_PREPARE,
    'prepare-daily-post',
    0,
  );
  const generate = fanOutNode(
    'generate-post',
    AI_INFLUENCER_WORKFLOW_IDS.GENERATE_POST,
    160,
    1,
  );
  const mark = actionNode(
    AI_INFLUENCER_ACTION_IDS.DAILY_MARK_RUN,
    'mark-autopilot-run',
    320,
  );
  return definition(
    AI_INFLUENCER_WORKFLOW_IDS.DAILY_POST,
    'Generate Daily AI Influencer Post',
    'Runs one post workflow and records the persona autopilot timestamp only after success.',
    [prepare, generate, mark],
    [
      {
        id: 'post-request',
        source: prepare.id,
        sourceHandle: 'items',
        target: generate.id,
        targetHandle: 'items',
      },
      {
        id: 'post-result-to-mark',
        source: generate.id,
        target: mark.id,
        targetHandle: 'postBatch',
      },
    ],
    mark.id,
  );
}

export function buildAiInfluencerDailyPostsWorkflowDefinition(): SystemWorkflowGraphDefinition {
  const discover = actionNode(
    AI_INFLUENCER_ACTION_IDS.DAILY_DISCOVER,
    'discover-personas',
    0,
  );
  const generate = fanOutNode(
    'generate-daily-posts',
    AI_INFLUENCER_WORKFLOW_IDS.DAILY_POST,
    160,
  );
  const finalize = actionNode(
    AI_INFLUENCER_ACTION_IDS.DAILY_FINALIZE,
    'finalize-daily-posts',
    320,
  );
  return definition(
    AI_INFLUENCER_WORKFLOW_IDS.DAILY_POSTS,
    'Generate AI Influencer Daily Posts',
    'Discovers enabled tenant personas, runs one durable child workflow per persona, and aggregates the results.',
    [discover, generate, finalize],
    [
      {
        id: 'persona-items',
        source: discover.id,
        sourceHandle: 'items',
        target: generate.id,
        targetHandle: 'items',
      },
      {
        id: 'daily-results',
        source: generate.id,
        target: finalize.id,
        targetHandle: 'batch',
      },
    ],
    finalize.id,
    false,
  );
}

function sequenceEdges(ids: string[]): WorkflowEdge[] {
  return ids.slice(1).map((id, index) => ({
    id: `${ids[index]}-to-${id}`,
    source: ids[index] ?? '',
    target: id,
    targetHandle: 'state',
  }));
}

export const AI_INFLUENCER_WORKFLOW_DEFINITIONS = [
  singleActionWorkflow(
    AI_INFLUENCER_WORKFLOW_IDS.GENERATE_VOICE,
    AI_INFLUENCER_ACTION_IDS.VOICE_GENERATE,
    'Generate AI Influencer Voice',
    'Generates one persona voice asset.',
  ),
  singleActionWorkflow(
    AI_INFLUENCER_WORKFLOW_IDS.GENERATE_VIDEO,
    AI_INFLUENCER_ACTION_IDS.VIDEO_GENERATE,
    'Generate AI Influencer Video',
    'Generates one persona video asset.',
  ),
  singleActionWorkflow(
    AI_INFLUENCER_WORKFLOW_IDS.PUBLISH_PLATFORM,
    AI_INFLUENCER_ACTION_IDS.PLATFORM_PUBLISH,
    'Publish AI Influencer Platform Post',
    'Publishes one prepared persona post to one platform.',
  ),
  buildAiInfluencerGeneratePostWorkflowDefinition(),
  buildAiInfluencerDailyPostWorkflowDefinition(),
  buildAiInfluencerDailyPostsWorkflowDefinition(),
] satisfies SystemWorkflowGraphDefinition[];

export function findAiInfluencerWorkflowDefinition(
  canonicalId: string,
): SystemWorkflowGraphDefinition {
  const definition = AI_INFLUENCER_WORKFLOW_DEFINITIONS.find(
    (candidate) => candidate.canonicalId === canonicalId,
  );
  if (!definition) {
    throw new Error(`Unknown AI influencer workflow: ${canonicalId}`);
  }
  return definition;
}
