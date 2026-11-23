import type {
  WorkflowInputVariable,
  WorkflowVisualNode,
} from '@api/collections/workflows/schemas/workflow.schema';
import type { SystemWorkflowGraphDefinition } from '@api/collections/workflows/system-workflow-runner.service';
import { getActionDefinition } from '@genfeedai/actions';

interface ContractInputSchema {
  properties?: Record<string, { type?: unknown } | undefined>;
  required?: readonly string[];
}

function readRequiredContractInputs(actionId: string): {
  key: string;
  type: WorkflowInputVariable['type'];
}[] {
  const schema = getActionDefinition(actionId)?.inputSchema as
    | ContractInputSchema
    | undefined;
  return (schema?.required ?? [])
    .filter((key) => key !== 'request')
    .map((key) => ({
      key,
      type: (schema?.properties?.[key]?.type === 'string'
        ? 'string'
        : 'json') as WorkflowInputVariable['type'],
    }));
}

function withEntryNodeInputs(
  node: WorkflowVisualNode,
  requiredKeys: readonly string[],
): WorkflowVisualNode {
  const listed = new Set(node.data.inputVariableKeys ?? []);
  const missing = requiredKeys.filter((key) => !listed.has(key));
  if (missing.length === 0) return node;
  return {
    ...node,
    data: {
      ...node.data,
      inputVariableKeys: [...(node.data.inputVariableKeys ?? []), ...missing],
    },
  };
}

/**
 * A `workflow.for-each` parent starts each child with `{ ...baseInput, item }`
 * as flat input values, and the converter copies only the keys a node lists in
 * `inputVariableKeys` (and the child declares as an input variable) into that
 * node. This derives both from the entry node's action contract, so the
 * properties the contract requires always arrive and the declaration cannot
 * drift from the contract (API-GENFEED-AI-B3). Explicit declarations win.
 */
export function withContractEntryInputs(
  child: SystemWorkflowGraphDefinition,
): SystemWorkflowGraphDefinition {
  const targeted = new Set(child.definition.edges.map((edge) => edge.target));
  const declared = new Map(
    (child.definition.inputVariables ?? []).map((variable) => [
      variable.key,
      variable,
    ]),
  );
  const nodes = child.definition.nodes.map((node) => {
    const actionId = String(node.data.config.actionId);
    if (
      targeted.has(node.id) ||
      actionId === 'workflow.for-each' ||
      actionId === 'workflow.run-child'
    ) {
      return node;
    }
    const required = readRequiredContractInputs(actionId);
    for (const { key, type } of required) {
      if (!declared.has(key)) {
        declared.set(key, { key, label: key, required: true, type });
      }
    }
    return withEntryNodeInputs(
      node,
      required.map(({ key }) => key),
    );
  });

  return {
    ...child,
    definition: {
      ...child.definition,
      inputVariables: [...declared.values()],
      nodes,
    },
  };
}
