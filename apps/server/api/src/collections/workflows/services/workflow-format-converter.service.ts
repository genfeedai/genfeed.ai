import { isPersistableWorkflowNodeType } from '@api/collections/workflows/workflow-version-definition';
import {
  getWorkflowActionIdForNodeType,
  getWorkflowPresentationNodeType,
} from '@genfeedai/workflows/nodes';
import { Injectable } from '@nestjs/common';

export interface CoreWorkflowNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: Record<string, unknown>;
}

export interface CoreWorkflowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
}

export interface CoreWorkflowFormat {
  name?: string;
  description?: string;
  nodes: CoreWorkflowNode[];
  edges: CoreWorkflowEdge[];
  version?: number;
}

export interface CloudWorkflowNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: {
    label: string;
    config?: Record<string, unknown>;
    inputVariableKeys?: string[];
  };
}

export type CloudWorkflowEdge = CoreWorkflowEdge;

export interface CloudWorkflowFormat {
  name?: string;
  description?: string;
  nodes: CloudWorkflowNode[];
  edges: CloudWorkflowEdge[];
}

export type WorkflowSourceFormat = 'core' | 'cloud';

export interface ConversionResult {
  workflow: CloudWorkflowFormat;
  warnings: string[];
  unmappedNodeTypes: string[];
}

const WORKFLOW_INPUT_TYPES = {
  audioInput: 'audio',
  imageInput: 'image',
  'input-prompt': 'text',
  videoInput: 'video',
} as const satisfies Readonly<Record<string, string>>;

const NODE_DATA_META_KEYS = new Set([
  'cachedOutput',
  'color',
  'comment',
  'config',
  'error',
  'inputVariableKeys',
  'isLocked',
  'label',
  'lockTimestamp',
  'progress',
  'status',
]);

function readRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function readInputVariableKeys(data: Record<string, unknown>): string[] {
  return Array.isArray(data.inputVariableKeys)
    ? data.inputVariableKeys.filter(
        (key): key is string => typeof key === 'string',
      )
    : [];
}

function extractParameters(
  data: Record<string, unknown>,
): Record<string, unknown> {
  const parameters = { ...readRecord(data.config) };
  for (const [key, value] of Object.entries(data)) {
    if (!NODE_DATA_META_KEYS.has(key) && value !== undefined) {
      parameters[key] = value;
    }
  }
  return parameters;
}

export function detectFormat(
  workflow: CoreWorkflowFormat | CloudWorkflowFormat,
): WorkflowSourceFormat {
  return workflow.nodes.some((node) => {
    const config = readRecord(node.data?.config);
    return node.type === 'genfeedAction' || typeof config.actionId === 'string';
  })
    ? 'cloud'
    : 'core';
}

@Injectable()
export class WorkflowFormatConverterService {
  convertCoreToCloud(workflow: CoreWorkflowFormat): ConversionResult {
    return this.toActionGraph(workflow);
  }

  convertCloudToCore(workflow: CloudWorkflowFormat): {
    workflow: CoreWorkflowFormat;
    warnings: string[];
  } {
    const nodes = workflow.nodes.map((node): CoreWorkflowNode => {
      if (node.type !== 'genfeedAction') {
        return {
          data: {
            label: node.data.label,
            status: 'idle',
            ...readRecord(node.data.config),
          },
          id: node.id,
          position: node.position,
          type: node.type,
        };
      }

      const config = readRecord(node.data.config);
      const actionId = config.actionId;
      if (
        typeof actionId !== 'string' ||
        !getWorkflowActionIdForNodeType(actionId)
      ) {
        throw new Error(
          `Workflow node ${node.id} references unknown Genfeed action ${String(actionId)}`,
        );
      }

      return {
        data: {
          label: node.data.label,
          status: 'idle',
          ...readRecord(config.parameters),
        },
        id: node.id,
        position: node.position,
        type: getWorkflowPresentationNodeType(actionId),
      };
    });

    return {
      warnings: [],
      workflow: {
        description: workflow.description,
        edges: workflow.edges,
        name: workflow.name,
        nodes,
        version: 1,
      },
    };
  }

  ensureCloudFormat(
    workflow: CoreWorkflowFormat | CloudWorkflowFormat,
  ): ConversionResult {
    return this.toActionGraph(workflow);
  }

  private toActionGraph(
    workflow: CoreWorkflowFormat | CloudWorkflowFormat,
  ): ConversionResult {
    return {
      unmappedNodeTypes: [],
      warnings: [],
      workflow: {
        description: workflow.description,
        edges: workflow.edges,
        name: workflow.name,
        nodes: workflow.nodes.map((node) => this.toActionNode(node)),
      },
    };
  }

  private toActionNode(
    node: CoreWorkflowNode | CloudWorkflowNode,
  ): CloudWorkflowNode {
    const data = readRecord(node.data);
    const label = typeof data.label === 'string' ? data.label : node.type;
    const inputVariableKeys = readInputVariableKeys(data);

    if (node.type === 'genfeedAction') {
      const config = readRecord(data.config);
      const actionId = config.actionId;
      if (
        typeof actionId !== 'string' ||
        !getWorkflowActionIdForNodeType(actionId)
      ) {
        throw new Error(
          `Workflow node ${node.id} references unknown Genfeed action ${String(actionId)}`,
        );
      }

      return {
        ...node,
        data: {
          ...(inputVariableKeys.length > 0 ? { inputVariableKeys } : {}),
          config: {
            actionId,
            parameters: readRecord(config.parameters),
          },
          label,
        },
        type: 'genfeedAction',
      };
    }

    const inputType = (
      WORKFLOW_INPUT_TYPES as Readonly<Record<string, string>>
    )[node.type];
    if (inputType) {
      const parameters = extractParameters(data);
      const defaultValue =
        parameters[inputType] ?? parameters.defaultValue ?? parameters.value;

      return {
        ...node,
        data: {
          config: {
            ...(defaultValue !== undefined ? { defaultValue } : {}),
            inputName:
              typeof parameters.inputName === 'string'
                ? parameters.inputName
                : node.id,
            inputType,
            required: parameters.required === true,
          },
          label,
        },
        type: 'workflowInput',
      };
    }

    if (isPersistableWorkflowNodeType(node.type)) {
      return {
        ...node,
        data: {
          ...(inputVariableKeys.length > 0 ? { inputVariableKeys } : {}),
          config: extractParameters(data),
          label,
        },
      };
    }

    const actionId = getWorkflowActionIdForNodeType(node.type);
    if (!actionId) {
      throw new Error(
        `Workflow node ${node.id} uses unsupported product node type ${node.type}; use a registered Genfeed action node`,
      );
    }

    return {
      ...node,
      data: {
        ...(inputVariableKeys.length > 0 ? { inputVariableKeys } : {}),
        config: {
          actionId,
          parameters: extractParameters(data),
        },
        label,
      },
      type: 'genfeedAction',
    };
  }
}
