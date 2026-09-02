/**
 * Telegram Workflow Loader
 *
 * Loads action-backed workflow JSON definitions from the workflows package and
 * adapts them into hidden, immutable system workflow definitions.
 */

import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import type { WorkflowVisualNode } from '@api/collections/workflows/schemas/workflow.schema';
import type { SystemWorkflowGraphDefinition } from '@api/collections/workflows/system-workflow-runner.service';
import type {
  TelegramWorkflowName,
  WorkflowInput,
  WorkflowInputVariable,
  WorkflowJson,
} from '@api/services/telegram-bot/telegram-bot.types';
import {
  createGenfeedActionNode,
  getActionDefinition,
} from '@genfeedai/actions';
import type { LoggerService } from '@libs/logger/logger.service';

const WORKFLOW_INPUT_NODE_TYPES = new Set(['workflowInput']);

const TELEGRAM_WORKFLOW_FILES: TelegramWorkflowName[] = [
  'single-image',
  'image-series',
  'image-to-video',
  'single-video',
  'full-pipeline',
];

export const TELEGRAM_SYSTEM_WORKFLOW_PREFIX = 'telegram.';

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function readString(
  source: Record<string, unknown> | undefined,
  key: string,
): string | undefined {
  const value = source?.[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function readRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function readBoolean(
  source: Record<string, unknown> | undefined,
  key: string,
): boolean | undefined {
  const value = source?.[key];
  return typeof value === 'boolean' ? value : undefined;
}

function toSupportedInputType(
  value: unknown,
): WorkflowInput['inputType'] | undefined {
  return value === 'audio' ||
    value === 'image' ||
    value === 'text' ||
    value === 'video'
    ? value
    : undefined;
}

function getNodeConfig(
  node: WorkflowJson['nodes'][number],
): Record<string, unknown> {
  return isRecord(node.data.config) ? node.data.config : node.data;
}

function isWorkflowInputNode(nodeType: string): boolean {
  return WORKFLOW_INPUT_NODE_TYPES.has(nodeType);
}

function workflowInputKey(node: WorkflowJson['nodes'][number]): string {
  return readString(getNodeConfig(node), 'inputName') ?? node.id;
}

function findWorkflowInputNode(
  workflow: WorkflowJson,
  inputKey: string,
): WorkflowJson['nodes'][number] | undefined {
  return workflow.nodes.find(
    (node) =>
      isWorkflowInputNode(node.type) && workflowInputKey(node) === inputKey,
  );
}

function createRuntimeWorkflowInput(
  variable: WorkflowInputVariable,
  node: WorkflowJson['nodes'][number] | undefined,
): WorkflowInput | undefined {
  const inputType = toSupportedInputType(variable.type);
  if (!inputType) {
    return undefined;
  }

  const nodeConfig = node ? getNodeConfig(node) : undefined;
  const defaultValue =
    typeof variable.defaultValue === 'string'
      ? variable.defaultValue
      : readString(nodeConfig, 'defaultValue');

  return {
    defaultValue,
    inputKey: variable.key,
    inputType,
    label: variable.label || readString(node?.data, 'label') || variable.key,
    nodeId: node?.id ?? variable.key,
    nodeType: node?.type ?? 'workflowInput',
    required: variable.required ?? readBoolean(nodeConfig, 'required') ?? true,
  };
}

function createWorkflowInputNodeInput(
  node: WorkflowJson['nodes'][number],
): WorkflowInput | undefined {
  const nodeConfig = getNodeConfig(node);
  const inputType = toSupportedInputType(nodeConfig.inputType);
  if (!inputType) {
    return undefined;
  }

  const inputKey = workflowInputKey(node);

  return {
    defaultValue: readString(nodeConfig, 'defaultValue'),
    inputKey,
    inputType,
    label: readString(node.data, 'label') ?? inputKey,
    nodeId: node.id,
    nodeType: node.type,
    required: readBoolean(nodeConfig, 'required') ?? false,
  };
}

/**
 * Load workflow JSONs from the core workflows package into a name → JSON map.
 */
export async function loadTelegramWorkflows(
  logger: LoggerService,
): Promise<Map<string, WorkflowJson>> {
  const workflows = new Map<string, WorkflowJson>();

  try {
    for (const name of TELEGRAM_WORKFLOW_FILES) {
      try {
        const filePath = resolveWorkflowFallbackPath(name);
        if (!filePath) {
          throw new Error(`Workflow file not found for ${name}`);
        }
        const content = await readFile(filePath, 'utf-8');
        workflows.set(name, JSON.parse(content) as WorkflowJson);
      } catch {
        logger.warn(`TelegramBotService: Could not load workflow: ${name}`);
      }
    }

    logger.log(`TelegramBotService: Loaded ${workflows.size} workflows`);
  } catch (error) {
    logger.error('TelegramBotService: Failed to load workflows', { error });
  }

  return workflows;
}

export function resolveWorkflowFallbackPath(name: string): string | null {
  const starts = [process.cwd(), dirname(fileURLToPath(import.meta.url))];

  for (const start of starts) {
    for (let depth = 0; depth <= 10; depth += 1) {
      const candidateRoot = resolve(start, ...Array(depth).fill('..'));
      const candidatePath = join(
        candidateRoot,
        'packages',
        'workflows',
        'workflows',
        `${name}.json`,
      );
      if (existsSync(candidatePath)) {
        return candidatePath;
      }
    }
  }

  return null;
}

export function toTelegramSystemWorkflowDefinition(
  workflowId: string,
  workflow: WorkflowJson,
): SystemWorkflowGraphDefinition {
  const inputs = extractWorkflowInputs(workflow);
  const resultNodes = workflow.nodes.filter((node) => {
    const config = getNodeConfig(node);
    return config.actionId === 'workflow.collect-output';
  });
  if (resultNodes.length !== 1) {
    throw new Error(
      `Telegram workflow ${workflowId} must contain exactly one workflow.collect-output action`,
    );
  }
  const resultNode = resultNodes[0];
  if (!resultNode) {
    throw new Error(`Telegram workflow ${workflowId} has no output action`);
  }

  const nodes: WorkflowVisualNode[] = workflow.nodes.map((node, index) => {
    const position = node.position ?? { x: index * 280, y: 120 };
    const label = readString(node.data, 'label') ?? node.type;
    if (isWorkflowInputNode(node.type)) {
      return {
        data: { config: getNodeConfig(node), label },
        id: node.id,
        position,
        type: 'workflowInput',
      };
    }
    if (node.type !== 'genfeedAction') {
      throw new Error(
        `Telegram workflow ${workflowId} contains unsupported product node ${node.type}`,
      );
    }

    const config = getNodeConfig(node);
    const actionId = readString(config, 'actionId');
    if (!actionId || !getActionDefinition(actionId)) {
      throw new Error(
        `Telegram workflow ${workflowId} references unknown Genfeed action ${String(actionId)}`,
      );
    }
    const generated = createGenfeedActionNode({
      actionId,
      id: node.id,
      inputVariableKeys:
        actionId === 'workflow.collect-output' ? [] : ['brandId'],
      label,
      position,
    });
    return {
      ...generated,
      data: {
        ...generated.data,
        config: {
          ...generated.data.config,
          parameters: readRecord(config.parameters),
        },
      },
    };
  });

  return {
    canonicalId: `${TELEGRAM_SYSTEM_WORKFLOW_PREFIX}${workflowId}`,
    changeSummary:
      'Run the Telegram media recipe through shared Genfeed actions.',
    definition: {
      edges: workflow.edges,
      inputVariables: [
        ...inputs.map((input) => ({
          defaultValue: input.defaultValue,
          key: input.inputKey ?? input.nodeId,
          label: input.label,
          required: input.required,
          type: 'string',
        })),
        {
          key: 'brandId',
          label: 'Execution brand',
          required: true,
          type: 'string',
        },
      ],
      nodes,
    },
    description: workflow.description,
    label: workflow.name,
    resultNodeId: resultNode.id,
    version: workflow.version,
  };
}

/**
 * Extract the required inputs the user must provide for a workflow.
 */
export function extractWorkflowInputs(workflow: WorkflowJson): WorkflowInput[] {
  const inputs: WorkflowInput[] = [];

  if (workflow.inputVariables && workflow.inputVariables.length > 0) {
    for (const variable of workflow.inputVariables) {
      const input = createRuntimeWorkflowInput(
        variable,
        findWorkflowInputNode(workflow, variable.key),
      );
      if (input) {
        inputs.push(input);
      }
    }

    return inputs;
  }

  for (const node of workflow.nodes) {
    if (isWorkflowInputNode(node.type)) {
      const input = createWorkflowInputNodeInput(node);
      if (input) {
        inputs.push(input);
      }
      continue;
    }
    if (node.type === 'genfeedAction') {
      continue;
    }

    throw new Error(
      `Telegram workflow ${workflow.name} contains unsupported non-action node ${node.type}`,
    );
  }

  return inputs;
}
