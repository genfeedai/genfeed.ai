import type {
  WorkflowEdge,
  WorkflowInputVariable,
  WorkflowVisualNode,
} from '@api/collections/workflows/schemas/workflow.schema';
import { VISUAL_TRIGGER_NODE_TYPE_TO_EXECUTOR } from '@api/collections/workflows/services/workflow-executor.constants';
import { isHiddenSystemWorkflowMetadata } from '@api/collections/workflows/system-workflow.contract';
import { isWorkflowInputNodeType } from '@api/collections/workflows/workflow-node-predicates';
import { isPersistableWorkflowNodeType } from '@api/collections/workflows/workflow-version-definition';
import { getActionDefinition } from '@genfeedai/actions';
import type {
  ExecutableEdge,
  ExecutableNode,
  ExecutableWorkflow,
} from '@genfeedai/workflows/engine';

export interface WorkflowDocumentShape {
  brandId?: string | null;
  id?: string;
  versionId?: string;
  nodes?: WorkflowVisualNode[];
  edges?: WorkflowEdge[];
  lockedNodeIds?: string[];
  metadata?: unknown;
  organizationId?: string;
  userId?: string;
}

const ENGINE_NATIVE_NODE_TYPE_TO_EXECUTOR: Record<string, string> = {
  'control-branch': 'condition',
  'control-delay': 'delay',
  'input-image': 'input-image',
  'input-video': 'input-video',
  ...VISUAL_TRIGGER_NODE_TYPE_TO_EXECUTOR,
};

const BRAND_ID_REQUIRED_NODE_TYPES = new Set([
  'aiAvatarVideo',
  'analyticsFeedback',
  'brandContext',
  'effect-captions',
  'imageGen',
  'musicSource',
  'soundOverlay',
  'textToSpeech',
]);

export class WorkflowEngineConverterService {
  convertToExecutableWorkflow(
    workflowDoc: WorkflowDocumentShape,
  ): ExecutableWorkflow {
    const primaryBrandId = workflowDoc.brandId ?? undefined;
    const nodes: ExecutableNode[] = (workflowDoc.nodes || []).map((node) => {
      const persistedConfig = this.mergeNodeConfig(node);
      const inputVariableKeys = (
        node.data as unknown as { inputVariableKeys?: unknown } | undefined
      )?.inputVariableKeys;
      const { config, executorType } = this.resolveExecutor(
        node,
        persistedConfig,
        primaryBrandId,
      );
      const nodeConfig = Array.isArray(inputVariableKeys)
        ? { ...config, inputVariableKeys }
        : config;

      return {
        cachedOutput: (node as unknown as { cachedOutput?: unknown })
          .cachedOutput,
        config: nodeConfig,
        id: node.id,
        inputs: (node as unknown as { inputs?: string[] }).inputs || [],
        isLocked: workflowDoc.lockedNodeIds?.includes(node.id) || false,
        // An action envelope's identity is its action id — falling back to the
        // `genfeedAction` wrapper type would label every node identically.
        label:
          node.data?.label ||
          (typeof nodeConfig.actionId === 'string'
            ? nodeConfig.actionId
            : node.type),
        type: executorType,
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
      emitSharedEvents: !isHiddenSystemWorkflowMetadata(workflowDoc.metadata),
      id: workflowDoc.id || '',
      lockedNodeIds: workflowDoc.lockedNodeIds || [],
      nodes,
      organizationId: workflowDoc.organizationId ?? '',
      userId: workflowDoc.userId ?? '',
      versionId: workflowDoc.versionId ?? '',
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

  private mergeNodeConfig(node: WorkflowVisualNode): Record<string, unknown> {
    return this.readRecord(node.data?.config);
  }

  private resolveExecutor(
    node: WorkflowVisualNode,
    persistedConfig: Record<string, unknown>,
    brandId: string | undefined,
  ): { config: Record<string, unknown>; executorType: string } {
    if (node.type === 'genfeedAction') {
      const actionId = persistedConfig.actionId;
      if (typeof actionId !== 'string' || !getActionDefinition(actionId)) {
        throw new Error(
          `Workflow node ${node.id} references unknown Genfeed action ${String(actionId)}`,
        );
      }

      return {
        config: {
          actionId,
          parameters: this.withWorkflowBrandId(
            actionId,
            this.readRecord(persistedConfig.parameters),
            brandId,
          ),
        },
        executorType: 'genfeedAction',
      };
    }

    if (!isPersistableWorkflowNodeType(node.type)) {
      throw new Error(
        `Workflow node ${node.id} uses unsupported product node type ${node.type}; use a registered Genfeed action node`,
      );
    }

    return {
      config: this.withWorkflowBrandId(node.type, persistedConfig, brandId),
      executorType: ENGINE_NATIVE_NODE_TYPE_TO_EXECUTOR[node.type] ?? node.type,
    };
  }

  private withWorkflowBrandId(
    nodeType: string,
    config: Record<string, unknown>,
    brandId: string | undefined,
  ): Record<string, unknown> {
    if (
      !brandId ||
      !BRAND_ID_REQUIRED_NODE_TYPES.has(nodeType) ||
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

  private readRecord(value: unknown): Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }
}
