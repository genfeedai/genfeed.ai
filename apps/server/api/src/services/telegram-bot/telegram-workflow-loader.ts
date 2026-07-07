/**
 * Telegram Workflow Loader
 *
 * Loads workflow JSON definitions from the core workflows package and converts
 * them between the bot's JSON shape, the collected-input requirements, and the
 * engine's ExecutableWorkflow shape. The node-type → input-kind mapping lives
 * here in exactly one place (consumed by both input extraction and executable
 * conversion).
 */

import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import type {
  TelegramWorkflowName,
  WorkflowInput,
  WorkflowInputVariable,
  WorkflowJson,
} from '@api/services/telegram-bot/telegram-bot.types';
import type {
  ExecutableNode,
  ExecutableWorkflow,
} from '@genfeedai/workflow-engine';
import type { LoggerService } from '@libs/logger/logger.service';

/**
 * Canonical node-type → input descriptor mapping. Single source of truth for
 * both `extractWorkflowInputs` (what to collect) and `toExecutableWorkflow`
 * (where to inject the collected value).
 */
const TELEGRAM_INPUT_NODE_TYPES: Record<
  string,
  {
    inputType: WorkflowInput['inputType'];
    configField: 'image' | 'prompt' | 'audio' | 'video';
    defaultLabel: string;
  }
> = {
  audioInput: {
    configField: 'audio',
    defaultLabel: 'Audio',
    inputType: 'audio',
  },
  imageInput: {
    configField: 'image',
    defaultLabel: 'Image',
    inputType: 'image',
  },
  prompt: { configField: 'prompt', defaultLabel: 'Prompt', inputType: 'text' },
  telegramInput: {
    configField: 'image',
    defaultLabel: 'Image',
    inputType: 'image',
  },
  videoInput: {
    configField: 'video',
    defaultLabel: 'Video',
    inputType: 'video',
  },
};

const WORKFLOW_INPUT_NODE_TYPES = new Set(['workflowInput', 'workflow-input']);

const TELEGRAM_WORKFLOW_FILES: TelegramWorkflowName[] = [
  'single-image',
  'image-series',
  'image-to-video',
  'single-video',
  'full-pipeline',
  'ugc-factory',
];

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

      const legacyCandidatePath = join(
        candidateRoot,
        'core',
        'packages',
        'workflows',
        'workflows',
        `${name}.json`,
      );
      if (existsSync(legacyCandidatePath)) {
        return legacyCandidatePath;
      }
    }
  }

  return null;
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

    const descriptor = TELEGRAM_INPUT_NODE_TYPES[node.type];
    if (!descriptor) {
      continue;
    }

    const input: WorkflowInput = {
      inputType: descriptor.inputType,
      label: (node.data.label as string) || descriptor.defaultLabel,
      nodeId: node.id,
      nodeType: node.type,
      required: true,
    };

    if (descriptor.inputType === 'text') {
      input.defaultValue = node.data[descriptor.configField] as string;
    }

    inputs.push(input);
  }

  return inputs;
}

/**
 * Convert a workflow JSON to an ExecutableWorkflow for the engine, injecting the
 * collected inputs into each input node's config.
 */
export function toExecutableWorkflow(
  workflow: WorkflowJson,
  collectedInputs: Map<string, string>,
  workflowId: string,
  organizationId?: string,
  userId?: string,
): ExecutableWorkflow {
  const inputDefaultsByKey = new Map(
    (workflow.inputVariables ?? []).map((variable) => [
      variable.key,
      variable.defaultValue,
    ]),
  );
  const lockedNodeIds = new Set<string>();

  const nodes: ExecutableNode[] = workflow.nodes.map((node) => {
    const config = { ...getNodeConfig(node) };

    // Inject collected inputs into node config
    const collectedValue = collectedInputs.get(node.id);
    if (isWorkflowInputNode(node.type)) {
      const inputKey = workflowInputKey(node);
      const runtimeValue =
        collectedInputs.get(inputKey) ??
        collectedValue ??
        inputDefaultsByKey.get(inputKey) ??
        config.defaultValue;
      if (runtimeValue !== undefined) {
        lockedNodeIds.add(node.id);
        config.value = runtimeValue;
      }
    } else if (collectedValue) {
      const descriptor = TELEGRAM_INPUT_NODE_TYPES[node.type];
      if (descriptor) {
        config[descriptor.configField] = collectedValue;
      }
    }

    const inputVariableKeys = Array.isArray(node.data.inputVariableKeys)
      ? node.data.inputVariableKeys.filter(
          (key): key is string => typeof key === 'string',
        )
      : Array.isArray(config.inputVariableKeys)
        ? config.inputVariableKeys.filter(
            (key): key is string => typeof key === 'string',
          )
        : [];
    for (const inputKey of inputVariableKeys) {
      const runtimeValue =
        collectedInputs.get(inputKey) ?? inputDefaultsByKey.get(inputKey);
      if (runtimeValue !== undefined) {
        config[inputKey] = runtimeValue;
      }
    }

    // Find input edges for this node
    const inputEdges = workflow.edges.filter((e) => e.target === node.id);
    const inputs = inputEdges.map((e) => e.source);

    return {
      config,
      cachedOutput: lockedNodeIds.has(node.id) ? config.value : undefined,
      id: node.id,
      inputs,
      isLocked: lockedNodeIds.has(node.id),
      label: (node.data.label as string) || node.type,
      type: node.type,
    };
  });

  const edges = workflow.edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    sourceHandle: edge.sourceHandle,
    target: edge.target,
    targetHandle: edge.targetHandle,
  }));

  return {
    edges,
    id: workflowId,
    lockedNodeIds: Array.from(lockedNodeIds),
    nodes,
    // Execute under the connected chat's real tenant when available; fall back
    // to the bot sentinel only for unauthenticated (no /connect) chats.
    organizationId: organizationId ?? 'telegram-bot',
    userId: userId ?? 'telegram-bot',
  };
}
