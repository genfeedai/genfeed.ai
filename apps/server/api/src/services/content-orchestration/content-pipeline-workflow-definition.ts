import type { WorkflowEdge } from '@api/collections/workflows/schemas/workflow.schema';
import type { SystemWorkflowGraphDefinition } from '@api/collections/workflows/system-workflow-runner.service';
import { buildWorkflowVersionDefinition } from '@api/collections/workflows/workflow-version-definition';
import type {
  PipelineConfigV2,
  PipelineStep,
} from '@api/services/content-orchestration/pipeline.interfaces';
import { createGenfeedActionNode } from '@genfeedai/actions';

const PIPELINE_ACTION_BY_STEP_TYPE = {
  'image-to-video': 'content.pipeline.generate-video',
  'text-to-image': 'content.pipeline.generate-image',
  'text-to-music': 'content.pipeline.generate-music',
  'text-to-speech': 'content.pipeline.generate-speech',
} as const satisfies Readonly<Record<PipelineStep['type'], string>>;

function toSerializableConfig(config: PipelineConfigV2) {
  return {
    brandId: config.brandId,
    organizationId: config.organizationId,
    personaId: config.personaId,
    ...(config.platforms ? { platforms: config.platforms } : {}),
    ...(config.prompt ? { prompt: config.prompt } : {}),
    publishMode: config.publishMode ?? 'final',
    ...(config.runReferences ? { runReferences: config.runReferences } : {}),
    ...(config.scheduledDate
      ? { scheduledDate: config.scheduledDate.toISOString() }
      : {}),
    userId: config.userId,
  };
}

export function buildContentPipelineWorkflowDefinition(
  config: PipelineConfigV2,
): SystemWorkflowGraphDefinition {
  if (config.steps.length === 0) {
    throw new Error('Content pipeline workflow requires at least one action');
  }

  const contextConfig = toSerializableConfig(config);
  const { runReferences: _runReferences, ...sharedConfig } = contextConfig;
  const contextNodeId = 'resolve-context';
  const nodes = [
    createGenfeedActionNode({
      actionId: 'content.pipeline.resolve-context',
      id: contextNodeId,
      parameters: contextConfig,
      position: { x: 0, y: 0 },
    }),
    ...config.steps.map((step, stepIndex) =>
      createGenfeedActionNode({
        actionId: PIPELINE_ACTION_BY_STEP_TYPE[step.type],
        id: `generate-${stepIndex + 1}`,
        parameters: {
          ...sharedConfig,
          step,
          stepIndex,
        },
        position: { x: 0, y: (stepIndex + 1) * 160 },
      }),
    ),
  ];
  const resultNodeId = 'publish-content';
  nodes.push(
    createGenfeedActionNode({
      actionId: 'content.pipeline.publish',
      id: resultNodeId,
      parameters: sharedConfig,
      position: { x: 0, y: (config.steps.length + 1) * 160 },
    }),
  );

  const edges: WorkflowEdge[] = [];
  edges.push({
    id: 'context-to-publish',
    source: contextNodeId,
    target: resultNodeId,
    targetHandle: 'pipelineContext',
  });
  config.steps.forEach((_step, stepIndex) => {
    edges.push({
      id: `context-to-generate-${stepIndex + 1}`,
      source: contextNodeId,
      target: `generate-${stepIndex + 1}`,
      targetHandle: 'pipelineContext',
    });
  });
  for (let stepIndex = 1; stepIndex < config.steps.length; stepIndex += 1) {
    edges.push({
      id: `generate-${stepIndex}-to-${stepIndex + 1}`,
      source: `generate-${stepIndex}`,
      target: `generate-${stepIndex + 1}`,
      targetHandle: 'previousOutcome',
    });
  }
  config.steps.forEach((_step, stepIndex) => {
    edges.push({
      id: `generate-${stepIndex + 1}-to-publish`,
      source: `generate-${stepIndex + 1}`,
      target: resultNodeId,
      targetHandle: `stepOutcome${stepIndex}`,
    });
  });

  const definition = { edges, nodes };
  const contentHash = buildWorkflowVersionDefinition(definition).contentHash;
  const identity =
    config.idempotencyKey ?? contentHash.replace('sha256:v1:', '');

  return {
    canonicalId: `content-pipeline:${config.personaId}:${identity}`,
    definition,
    description:
      'Generates, persists, and publishes one action-backed content pipeline.',
    label: 'Content Pipeline',
    resultNodeId,
  };
}
