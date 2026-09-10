import {
  type ActionWorkflowCategory,
  ALL_ACTIONS,
  type GenfeedActionDefinition,
} from '@genfeedai/actions';
import { actionSchemaHandles } from '../../ui/nodes/saas/action-schema';
import { DEFAULT_GENFEED_ACTION_DATA } from '../definitions';
import type { ExtendedNodeCategory, SaaSHandleType } from '../types';
import type { CatalogNodeDefinition } from './catalog-node-definition';

const WORKFLOW_CATEGORY_TO_NODE_CATEGORY: Record<
  ActionWorkflowCategory,
  ExtendedNodeCategory
> = {
  ai: 'ai',
  composition: 'composition',
  input: 'input',
  output: 'output',
  processing: 'processing',
};

function handlesFromSchema(
  schema: object | undefined,
  direction: 'input' | 'output',
): CatalogNodeDefinition['inputs'] {
  return actionSchemaHandles(schema, direction).map((handle) => ({
    id: handle.id,
    label: handle.label,
    multiple: handle.multiple,
    required: handle.required ?? false,
    type: handle.type as SaaSHandleType,
  }));
}

function categoryForAction(
  action: GenfeedActionDefinition,
): ExtendedNodeCategory {
  if (!action.workflowCategory) {
    return 'saas';
  }
  return WORKFLOW_CATEGORY_TO_NODE_CATEGORY[action.workflowCategory];
}

export function buildActionNodeDefinitions(
  actions: readonly GenfeedActionDefinition[] = ALL_ACTIONS,
): Record<string, CatalogNodeDefinition> {
  const definitions: Record<string, CatalogNodeDefinition> = {};

  for (const action of actions) {
    if (action.visibility !== 'workflow') {
      continue;
    }

    definitions[action.id] = {
      category: categoryForAction(action),
      defaultData: {
        ...DEFAULT_GENFEED_ACTION_DATA,
        actionId: action.id,
        label: action.label,
      },
      description: action.description,
      icon: action.workflowIcon ?? 'Workflow',
      inputs: handlesFromSchema(action.inputSchema, 'input'),
      label: action.label,
      outputs: handlesFromSchema(action.outputSchema, 'output'),
      type: action.id,
    };
  }

  return definitions;
}

export const ACTION_NODE_DEFINITIONS = buildActionNodeDefinitions();
