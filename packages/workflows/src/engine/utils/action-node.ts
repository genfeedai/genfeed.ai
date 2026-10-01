import {
  GENFEED_ACTION_NODE_TYPE,
  getActionDefinition,
} from '@genfeedai/actions';
import type { ExecutableNode } from '../types';

export interface CreateExecutableActionNodeInput {
  actionId: string;
  id: string;
  inputs?: string[];
  isLocked?: boolean;
  label?: string;
  parameters?: Record<string, unknown>;
}

export const ENGINE_NATIVE_NODE_TYPES: ReadonlySet<string> = new Set([
  'commentTrigger',
  'condition',
  'control-branch',
  'control-delay',
  'delay',
  'engagementTrigger',
  'input-image',
  'input-video',
  'keywordTrigger',
  'mentionTrigger',
  'newFollowerTrigger',
  'newLikeTrigger',
  'newRepostTrigger',
  'postPublishTrigger',
  'reviewGate',
  'workflowInput',
]);

export function isEngineNativeNodeType(nodeType: string): boolean {
  return (
    ENGINE_NATIVE_NODE_TYPES.has(nodeType) || nodeType.startsWith('trigger-')
  );
}

/**
 * Builds the only executable shape allowed for product operations.
 *
 * Templates and direct engine callers use this constructor so action identity
 * is validated by the shared catalog before a workflow reaches execution.
 */
export function createExecutableActionNode(
  input: CreateExecutableActionNodeInput,
): ExecutableNode {
  const action = getActionDefinition(input.actionId);
  if (!action) {
    throw new Error(`Unknown Genfeed action: ${input.actionId}`);
  }

  return {
    config: {
      actionId: action.id,
      parameters: input.parameters ?? {},
    },
    id: input.id,
    inputs: input.inputs ?? [],
    ...(input.isLocked !== undefined ? { isLocked: input.isLocked } : {}),
    label: input.label ?? action.label,
    type: GENFEED_ACTION_NODE_TYPE,
  };
}

export function getExecutableNodeOperationId(node: ExecutableNode): string {
  if (node.type !== GENFEED_ACTION_NODE_TYPE) {
    if (isEngineNativeNodeType(node.type)) {
      return node.type;
    }
    throw new Error(
      `Executable product node ${node.id} must use the Genfeed action envelope; received ${node.type}`,
    );
  }

  const actionId = node.config.actionId;
  if (typeof actionId !== 'string' || !getActionDefinition(actionId)) {
    throw new Error(
      `Executable action node ${node.id} references unknown Genfeed action ${String(actionId)}`,
    );
  }

  return actionId;
}

/** Normalize the product envelope exactly once, preserving runtime overrides over stored parameters. */
export function unwrapExecutableActionNode(
  node: ExecutableNode,
): ExecutableNode {
  if (node.type !== GENFEED_ACTION_NODE_TYPE) return node;
  const actionId = node.config.actionId;
  if (typeof actionId !== 'string' || actionId.length === 0)
    throw new Error('A Genfeed action node requires a non-empty actionId');
  if (!getActionDefinition(actionId))
    throw new Error(`Unknown Genfeed action: ${actionId}`);
  const { actionId: _actionId, parameters, ...runtimeConfig } = node.config;
  const stored =
    parameters !== null &&
    typeof parameters === 'object' &&
    !Array.isArray(parameters)
      ? (parameters as Record<string, unknown>)
      : {};
  return { ...node, config: { ...stored, ...runtimeConfig }, type: actionId };
}
