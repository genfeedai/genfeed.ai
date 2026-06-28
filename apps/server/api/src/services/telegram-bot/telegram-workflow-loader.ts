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

const TELEGRAM_WORKFLOW_FILES: TelegramWorkflowName[] = [
  'single-image',
  'image-series',
  'image-to-video',
  'single-video',
  'full-pipeline',
  'ugc-factory',
];

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

  for (const node of workflow.nodes) {
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
  const nodes: ExecutableNode[] = workflow.nodes.map((node) => {
    const config = { ...node.data };

    // Inject collected inputs into node config
    const collectedValue = collectedInputs.get(node.id);
    if (collectedValue) {
      const descriptor = TELEGRAM_INPUT_NODE_TYPES[node.type];
      if (descriptor) {
        config[descriptor.configField] = collectedValue;
      }
    }

    // Find input edges for this node
    const inputEdges = workflow.edges.filter((e) => e.target === node.id);
    const inputs = inputEdges.map((e) => e.source);

    return {
      config,
      id: node.id,
      inputs,
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
    lockedNodeIds: [],
    nodes,
    // Execute under the connected chat's real tenant when available; fall back
    // to the bot sentinel only for unauthenticated (no /connect) chats.
    organizationId: organizationId ?? 'telegram-bot',
    userId: userId ?? 'telegram-bot',
  };
}
