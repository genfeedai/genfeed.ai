import {
  isWorkflowInputNodeType,
  normalizeWorkflowNodeTypeToCanonical,
} from '@api/collections/workflows/node-type-aliases';
import type {
  WorkflowEdge,
  WorkflowInputVariable,
  WorkflowStep,
  WorkflowVisualNode,
} from '@api/collections/workflows/schemas/workflow.schema';
import type {
  ExecutableEdge,
  ExecutableNode,
  ExecutableWorkflow,
} from '@genfeedai/workflow-engine';

export interface WorkflowDocumentShape {
  brands?: Array<string | { toString(): string }>;
  id?: string;
  nodes?: WorkflowVisualNode[];
  edges?: WorkflowEdge[];
  lockedNodeIds?: string[];
  organization?: string | { toString(): string };
  user?: string | { toString(): string };
}

const NODE_TYPE_TO_EXECUTOR: Record<string, string> = {
  'ai-avatar-video': 'aiAvatarVideo',
  'ai-enhance': 'ai-enhance',
  'ai-generate-image': 'imageGen',
  'ai-generate-newsletter': 'newsletterGen',
  'ai-generate-post': 'postGen',
  'ai-generate-video': 'ai-generate-video',
  'ai-lip-sync': 'lipSync',
  'ai-llm': 'llm',
  'ai-prompt-constructor': 'promptConstructor',
  'ai-reframe': 'reframe',
  'ai-text-to-speech': 'textToSpeech',
  'ai-transcribe': 'ai-transcribe',
  'ai-upscale': 'upscale',
  'ai-voice-change': 'voiceChange',
  brandAsset: 'brandAsset',
  'control-branch': 'condition',
  'control-delay': 'delay',
  'control-loop': 'control-loop',
  'effect-captions': 'effect-captions',
  'effect-color-grade': 'colorGrade',
  'effect-ken-burns': 'effect-ken-burns',
  'effect-portrait-blur': 'effect-portrait-blur',
  'effect-split-screen': 'effect-split-screen',
  'effect-text-overlay': 'effect-text-overlay',
  'effect-watermark': 'effect-watermark',
  'input-image': 'input-image',
  'input-prompt': 'input-prompt',
  'input-template': 'input-template',
  'input-video': 'input-video',
  'output-export': 'output-export',
  'output-notify': 'output-notify',
  'output-publish': 'publish',
  'output-save': 'output-save',
  'output-webhook': 'output-webhook',
  'process-compress': 'process-compress',
  'process-extract-audio': 'process-extract-audio',
  'process-merge-videos': 'process-merge-videos',
  'process-mirror': 'process-mirror',
  'process-resize': 'process-resize',
  'process-reverse': 'process-reverse',
  'process-transform': 'process-transform',
  'process-trim': 'process-trim',
  'social-post-reply': 'postReply',
  'social-send-dm': 'sendDm',
  'trigger-comment': 'commentTrigger',
  'trigger-mention': 'mentionTrigger',
  'trigger-new-follower': 'newFollowerTrigger',
  'trigger-new-like': 'newLikeTrigger',
  'trigger-new-repost': 'newRepostTrigger',
  'analytics-feedback': 'analyticsFeedback',
};

const BRAND_ID_REQUIRED_NODE_TYPES = new Set([
  'ai-avatar-video',
  'ai-generate-image',
  'analytics-feedback',
  'analyticsFeedback',
  'brandContext',
  'effect-captions',
  'imageGen',
  'ai-text-to-speech',
  'musicSource',
  'soundOverlay',
]);

export class WorkflowEngineConverterService {
  convertToExecutableWorkflow(
    workflowDoc: WorkflowDocumentShape,
  ): ExecutableWorkflow {
    const primaryBrandId =
      workflowDoc.brands && workflowDoc.brands.length > 0
        ? workflowDoc.brands[0]?.toString()
        : undefined;
    const nodes: ExecutableNode[] = (workflowDoc.nodes || []).map((node) => {
      const config =
        node.data?.config ||
        (node as unknown as { config?: Record<string, unknown> }).config ||
        {};
      const inputVariableKeys = (
        node.data as unknown as { inputVariableKeys?: unknown } | undefined
      )?.inputVariableKeys;
      const nodeConfig = Array.isArray(inputVariableKeys)
        ? { ...config, inputVariableKeys }
        : config;

      return {
        cachedOutput: (node as unknown as { cachedOutput?: unknown })
          .cachedOutput,
        config: this.withWorkflowBrandId(node.type, nodeConfig, primaryBrandId),
        id: node.id,
        inputs: (node as unknown as { inputs?: string[] }).inputs || [],
        isLocked: workflowDoc.lockedNodeIds?.includes(node.id) || false,
        label: node.data?.label || node.type,
        type: NODE_TYPE_TO_EXECUTOR[node.type] || node.type,
      };
    });

    const edges: ExecutableEdge[] = (workflowDoc.edges || []).map((edge) => ({
      id: edge.id,
      source: edge.source,
      sourceHandle: edge.sourceHandle,
      target: edge.target,
      targetHandle: edge.targetHandle,
    }));

    return {
      edges,
      id: workflowDoc.id || '',
      lockedNodeIds: workflowDoc.lockedNodeIds || [],
      nodes,
      organizationId:
        typeof workflowDoc.organization === 'object' && workflowDoc.organization
          ? workflowDoc.organization.toString()
          : '',
      userId:
        typeof workflowDoc.user === 'object' && workflowDoc.user
          ? workflowDoc.user.toString()
          : '',
    };
  }

  applyRuntimeInputValues(
    workflowDoc: {
      inputVariables?: WorkflowInputVariable[];
      nodes?: WorkflowVisualNode[];
    },
    executableWorkflow: ExecutableWorkflow,
    inputValues: Record<string, unknown> = {},
  ): ExecutableWorkflow {
    const workflowInputNodes = new Map(
      (workflowDoc.nodes ?? [])
        .filter((node) => isWorkflowInputNodeType(node.type))
        .map((node) => [node.id, node]),
    );
    const requiredInputs = new Set(
      (workflowDoc.inputVariables ?? [])
        .filter((variable) => variable.required)
        .map((variable) => variable.key),
    );
    const inputVariableDefaults = new Map(
      (workflowDoc.inputVariables ?? []).map((variable) => [
        variable.key,
        variable.defaultValue,
      ]),
    );
    const lockedNodeIds = new Set(executableWorkflow.lockedNodeIds);

    const nodes = executableWorkflow.nodes
      .filter((node) => {
        if (!isWorkflowInputNodeType(node.type)) {
          return true;
        }

        const sourceNode = workflowInputNodes.get(node.id);
        const inputName =
          this.readConfigString(sourceNode?.data?.config, 'inputName') ??
          node.id;
        const defaultValue = sourceNode?.data?.config?.defaultValue;
        const value =
          inputValues[inputName] !== undefined
            ? inputValues[inputName]
            : defaultValue;

        if (value !== undefined) {
          node.cachedOutput = value;
          node.isLocked = true;
          lockedNodeIds.add(node.id);
          return true;
        }

        const isRequired =
          requiredInputs.has(inputName) ||
          sourceNode?.data?.config?.required === true;

        if (isRequired) {
          throw new Error(`Missing required workflow input: ${inputName}`);
        }

        return false;
      })
      .map((node) => {
        const nextNode = { ...node };
        const inputVariableKeys = Array.isArray(node.config.inputVariableKeys)
          ? node.config.inputVariableKeys.filter(
              (key): key is string => typeof key === 'string',
            )
          : [];

        if (
          inputVariableKeys.length > 0 &&
          !isWorkflowInputNodeType(nextNode.type)
        ) {
          nextNode.config = { ...node.config };

          for (const key of inputVariableKeys) {
            const value =
              inputValues[key] !== undefined
                ? inputValues[key]
                : inputVariableDefaults.get(key);

            if (value !== undefined) {
              nextNode.config[key] = value;
            }
          }
        }

        return nextNode;
      });

    const nodeIds = new Set(nodes.map((node) => node.id));

    return {
      ...executableWorkflow,
      edges: executableWorkflow.edges.filter(
        (edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target),
      ),
      lockedNodeIds: Array.from(lockedNodeIds).filter((nodeId) =>
        nodeIds.has(nodeId),
      ),
      nodes,
    };
  }

  convertStepsToExecutableWorkflow(
    workflowId: string,
    steps: WorkflowStep[],
    userId: string,
    organizationId: string,
  ): ExecutableWorkflow {
    const nodes: ExecutableNode[] = steps.map((step) => ({
      config: step.config || {},
      id: step.id,
      inputs: [],
      label: step.label,
      type: (step as unknown as { type?: string }).type || '',
    }));

    const edges: ExecutableEdge[] = [];
    for (const step of steps) {
      if (step.dependsOn && step.dependsOn.length > 0) {
        for (const depId of step.dependsOn) {
          edges.push({
            id: `${depId}-${step.id}`,
            source: depId,
            target: step.id,
          });
        }
      }
    }

    return {
      edges,
      id: workflowId,
      lockedNodeIds: [],
      nodes,
      organizationId,
      userId,
    };
  }

  private withWorkflowBrandId(
    nodeType: string,
    config: Record<string, unknown>,
    brandId: string | undefined,
  ): Record<string, unknown> {
    const canonicalNodeType = normalizeWorkflowNodeTypeToCanonical(nodeType);

    if (
      !brandId ||
      !BRAND_ID_REQUIRED_NODE_TYPES.has(canonicalNodeType) ||
      typeof config.brandId === 'string'
    ) {
      return config;
    }

    return { ...config, brandId };
  }

  private readConfigString(
    config: Record<string, unknown> | undefined,
    key: string,
  ): string | undefined {
    const value = config?.[key];
    return typeof value === 'string' ? value : undefined;
  }
}
