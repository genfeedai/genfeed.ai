import { getActionDefinition } from '@genfeedai/actions';
import type {
  NodeType,
  VisualNodeDefinition,
} from '@genfeedai/contracts/types';
import { NODE_DEFINITIONS } from '@genfeedai/contracts/types';
import { isValidSaaSConnection } from '../../nodes/registry/connection-rules';
import { getNodeDefinition } from '../../nodes/registry/merged-registry';
import type { SaaSHandleType } from '../../nodes/types';
import { createActionVisualDefinition } from '../nodes/saas/action-schema';
import { generateHandlesFromSchema } from './schemaHandles';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function resolveWorkflowNodeDefinition(
  nodeType: string,
  data: Record<string, unknown> = {},
  override?: VisualNodeDefinition,
): VisualNodeDefinition | undefined {
  const actionId =
    nodeType === 'genfeedAction' && typeof data.actionId === 'string'
      ? data.actionId
      : undefined;
  const action = actionId ? getActionDefinition(actionId) : undefined;
  if (actionId && !action) return undefined;

  const definition = action
    ? createActionVisualDefinition(action)
    : (override ??
      (Object.hasOwn(NODE_DEFINITIONS, nodeType)
        ? NODE_DEFINITIONS[nodeType as NodeType]
        : getNodeDefinition(nodeType)));
  if (!definition) return undefined;

  const selectedModel = isRecord(data.selectedModel)
    ? data.selectedModel
    : undefined;
  const inputSchema = isRecord(selectedModel?.inputSchema)
    ? selectedModel.inputSchema
    : undefined;
  if (!inputSchema) return definition;

  const existingIds = new Set(definition.inputs.map((handle) => handle.id));
  const additionalInputs = generateHandlesFromSchema(inputSchema, []).filter(
    (handle) => !existingIds.has(handle.id),
  );
  return { ...definition, inputs: [...definition.inputs, ...additionalInputs] };
}

const HANDLE_TYPES = new Set<string>([
  'image',
  'text',
  'video',
  'number',
  'audio',
  'brand',
  'object',
  'any',
]);

export function isCompatibleWorkflowHandle(
  sourceType: string,
  targetType: string,
): boolean {
  return (
    HANDLE_TYPES.has(sourceType) &&
    HANDLE_TYPES.has(targetType) &&
    isValidSaaSConnection(
      sourceType as SaaSHandleType,
      targetType as SaaSHandleType,
    )
  );
}
