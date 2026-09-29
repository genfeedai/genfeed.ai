import { getNodeDefinition } from '@api/collections/workflows/registry/node-registry-adapter';
import { WorkflowAutomationExecutorRegistrarService } from '@api/collections/workflows/services/workflow-automation-executor-registrar.service';
import { WorkflowContentExecutorRegistrarService } from '@api/collections/workflows/services/workflow-content-executor-registrar.service';
import { WorkflowCoreExecutorRegistrarService } from '@api/collections/workflows/services/workflow-core-executor-registrar.service';
import type { WorkflowEngineAdapterService } from '@api/collections/workflows/services/workflow-engine-adapter.service';
import { WorkflowEngineConverterService } from '@api/collections/workflows/services/workflow-engine-converter.service';
import { WorkflowEngineExecutorHelperService } from '@api/collections/workflows/services/workflow-engine-executor-helper.service';
import { WorkflowEngineExecutorRegistryService } from '@api/collections/workflows/services/workflow-engine-executor-registry.service';
import { WorkflowMediaGenerationExecutorRegistrarService } from '@api/collections/workflows/services/workflow-media-generation-executor-registrar.service';
import { WorkflowMediaProcessingExecutorRegistrarService } from '@api/collections/workflows/services/workflow-media-processing-executor-registrar.service';
import { WorkflowSocialExecutorRegistrarService } from '@api/collections/workflows/services/workflow-social-executor-registrar.service';
import { WorkflowTrendPublishExecutorRegistrarService } from '@api/collections/workflows/services/workflow-trend-publish-executor-registrar.service';
import { SystemWorkflowRunnerService } from '@api/collections/workflows/system-workflow-runner.service';
import {
  SHOWCASE_WORKFLOW_TEMPLATE_IDS,
  WORKFLOW_TEMPLATES,
} from '@api/collections/workflows/templates/workflow-templates';
import { isWorkflowInputNodeType } from '@api/collections/workflows/workflow-node-predicates';
import { isKnowledgeWorkflowAction } from '@api/services/agent-orchestrator/tools/knowledge-workflow-execution.util';
import {
  GENFEED_ACTION_NODE_TYPE,
  getActionDefinition,
  getToolByName,
  getToolsForSurface,
} from '@genfeedai/actions';
import { WorkflowEngine } from '@genfeedai/workflows/engine';
import type { ModuleRef } from '@nestjs/core';
import { describe, expect, it } from 'vitest';

/**
 * Known template defects outside the showcase set, tracked for burn-down in
 * #5533. Each entry is `<templateId>:<edgeId>` or `<templateId>:<placeholder>`.
 * The guards compare against these lists exactly: a new defect fails, and so
 * does a fixed one that is still listed.
 */
const KNOWN_UNRESOLVED_SOURCE_HANDLES: readonly string[] = [
  'floor-plan-interior-preview:edge-floor-plan-alt-output',
  'floor-plan-interior-preview:edge-floor-plan-detail-output',
  'floor-plan-interior-preview:edge-floor-plan-hero-output',
  'instagram-remix-review:edge-instagram-remix-review',
  'source-maintenance:edge-capture-to-read',
  'source-maintenance:edge-read-to-capture',
  'virtual-staging-rescue:edge-virtual-staging-cleanup-output',
  'virtual-staging-rescue:edge-virtual-staging-premium-output',
];
const KNOWN_UNDECLARED_PLACEHOLDERS: readonly string[] = [
  'daily-image-generation:prompt',
  'motivational-quote-image:quote',
  'scheduled-video-creation:prompt',
  'social-media-video-series:prompt',
  'tiktok-slideshow-automation:niche',
  'tiktok-slideshow-automation:product',
  'webhook-notification:GENFEEDAI_WEBHOOKS_URL',
  'weekly-article-batch:topic',
];

const PLACEHOLDER_PATTERN = /\$\{([^}]+)\}/g;

function readRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/**
 * Whether the engine can deliver `handle` from an output matching `schema`.
 * `gatherInputs` passes a non-object output whole, but drops a named handle
 * that an object (or array) output does not carry.
 */
function outputCarriesHandle(schema: unknown, handle: string): boolean {
  const record = readRecord(schema);
  if (Array.isArray(record.anyOf)) {
    return record.anyOf.some((branch) => outputCarriesHandle(branch, handle));
  }
  if (record.type === 'array') {
    return false;
  }
  if (record.type !== 'object' || record.additionalProperties !== false) {
    return true;
  }
  return handle in readRecord(record.properties);
}

function readActionId(node: { data?: { config?: unknown } }): string | null {
  const actionId = readRecord(node.data?.config).actionId;
  return typeof actionId === 'string' ? actionId : null;
}

/**
 * A stand-in for an injected service. Registrars skip an executor whose
 * optional service is absent, so every dependency is present here and every
 * executor production can register is registered. Registration never calls
 * the services; any method called returns an empty list.
 */
function presentDependency<T>(): T {
  const handler: ProxyHandler<Record<PropertyKey, unknown>> = {
    get: (_target, property) =>
      typeof property === 'symbol' || property === 'then'
        ? undefined
        : () => [],
  };
  return new Proxy<Record<PropertyKey, unknown>>({}, handler) as unknown as T;
}

/**
 * The engine as production wires it: every API registrar (see
 * `WorkflowEngineExecutorRegistryService`), the runner's own control actions,
 * and the agent-tool bridge. Catalog templates install as customer workflows,
 * and the bridge (`AgentToolExecutorService.onModuleInit`) only runs Knowledge
 * actions there — every other agent tool requires an authenticated agent
 * runtime and fails in a customer workflow, so only Knowledge actions count.
 */
function createProductionEngine(): WorkflowEngine {
  const engine = new WorkflowEngine();
  const helper = new WorkflowEngineExecutorHelperService(
    presentDependency(),
    presentDependency(),
    presentDependency(),
    presentDependency(),
    presentDependency(),
  );
  const trendPublish = new WorkflowTrendPublishExecutorRegistrarService(
    helper,
    presentDependency(),
    presentDependency(),
    presentDependency(),
    presentDependency(),
    presentDependency(),
    presentDependency(),
    presentDependency(),
    presentDependency(),
    presentDependency(),
    presentDependency(),
    presentDependency(),
  );
  new WorkflowEngineExecutorRegistryService(
    new WorkflowCoreExecutorRegistrarService(
      helper,
      presentDependency(),
      presentDependency(),
      presentDependency(),
      presentDependency(),
      presentDependency(),
    ),
    new WorkflowSocialExecutorRegistrarService(
      helper,
      presentDependency(),
      presentDependency(),
      presentDependency(),
      presentDependency(),
      presentDependency(),
      presentDependency(),
      presentDependency(),
    ),
    new WorkflowMediaProcessingExecutorRegistrarService(
      helper,
      presentDependency(),
      presentDependency(),
      presentDependency(),
      presentDependency(),
      presentDependency(),
      presentDependency(),
      presentDependency(),
      presentDependency(),
      presentDependency(),
      presentDependency(),
      presentDependency(),
      presentDependency(),
    ),
    new WorkflowMediaGenerationExecutorRegistrarService(
      helper,
      presentDependency(),
      presentDependency(),
      presentDependency(),
      presentDependency(),
      presentDependency(),
      presentDependency(),
      presentDependency(),
      presentDependency(),
    ),
    new WorkflowContentExecutorRegistrarService(
      helper,
      presentDependency(),
      presentDependency(),
      presentDependency(),
      presentDependency(),
      presentDependency(),
      presentDependency(),
      presentDependency(),
    ),
    new WorkflowAutomationExecutorRegistrarService(
      presentDependency(),
      presentDependency(),
      presentDependency(),
      presentDependency(),
      presentDependency(),
      presentDependency(),
      presentDependency(),
      presentDependency(),
      presentDependency(),
      presentDependency(),
      presentDependency(),
    ),
    trendPublish,
  ).register(engine);

  const engineAdapter: Pick<
    WorkflowEngineAdapterService,
    'getRegisteredActionIds' | 'registerExecutor'
  > = {
    getRegisteredActionIds: () => engine.getRegisteredActionIds(),
    registerExecutor: (nodeType, executor) =>
      engine.registerExecutor(nodeType, executor),
  };
  const moduleRef = { get: () => engineAdapter } as unknown as ModuleRef;
  const runner = new SystemWorkflowRunnerService(
    presentDependency(),
    moduleRef,
  );
  runner.onModuleInit();
  for (const tool of getToolsForSurface('agent')) {
    const definition = getToolByName(tool.name);
    if (
      definition &&
      (definition.surfaces.agent || definition.surfaces.mcp) &&
      isKnowledgeWorkflowAction(tool.name)
    ) {
      runner.registerAction(tool.name, async () => ({}));
    }
  }

  return engine;
}

/** `<templateId>:<nodeId>:<actionId or node type>` for each node no executor runs. */
function findNodesWithoutExecutor(engine: WorkflowEngine): string[] {
  const converter = new WorkflowEngineConverterService();
  const registeredActionIds = new Set(engine.getRegisteredActionIds());
  const missing: string[] = [];

  for (const [templateId, template] of Object.entries(WORKFLOW_TEMPLATES)) {
    const executable = converter.convertToExecutableWorkflow({
      edges: template.edges ?? [],
      id: templateId,
      nodes: template.nodes ?? [],
    });
    for (const node of executable.nodes) {
      // Workflow inputs are bound from run inputs, never executed.
      if (isWorkflowInputNodeType(node.type)) {
        continue;
      }
      if (node.type === GENFEED_ACTION_NODE_TYPE) {
        const actionId = String(node.config.actionId);
        if (!registeredActionIds.has(actionId)) {
          missing.push(`${templateId}:${node.id}:${actionId}`);
        }
        continue;
      }
      if (!engine.getExecutor(node.type)) {
        missing.push(`${templateId}:${node.id}:${node.type}`);
      }
    }
  }

  return missing.sort();
}

describe('workflow template node coverage', () => {
  it('exposes a registry definition for every visual template node type', () => {
    const templateNodeTypes = new Set(
      Object.values(WORKFLOW_TEMPLATES)
        .flatMap((template) => template.nodes ?? [])
        .map((node) => node.type),
    );

    const missingNodeTypes = [...templateNodeTypes].filter(
      (nodeType) => !getNodeDefinition(nodeType),
    );

    expect(missingNodeTypes).toEqual([]);
  });
});

describe('workflow template wiring guard (#5533)', () => {
  it('runs every catalog node on an executor the production engine registers', () => {
    expect(findNodesWithoutExecutor(createProductionEngine())).toEqual([]);
  });

  it('builds the executor set production registers, not a permissive one', () => {
    const engine = createProductionEngine();
    const registeredActionIds = engine.getRegisteredActionIds();

    expect(registeredActionIds).toEqual(
      expect.arrayContaining([
        'effect-captions',
        'imageGen',
        'publish',
        'reframe',
        'search_knowledge',
        'videoGen',
        'workflow.collect-output',
        'workflow.run-child',
      ]),
    );
    for (const unregistered of [
      'effect-text-overlay',
      'generate_content_batch',
      'output-webhook',
      'process-resize',
      'process-transform',
    ]) {
      expect(registeredActionIds, unregistered).not.toContain(unregistered);
    }
    expect(engine.getExecutor('reviewGate')).toBeDefined();
  });

  it('names only source handles the source action output contract declares', () => {
    const unresolved: string[] = [];

    for (const [templateId, template] of Object.entries(WORKFLOW_TEMPLATES)) {
      const nodesById = new Map(
        (template.nodes ?? []).map((node) => [node.id, node]),
      );
      for (const edge of template.edges ?? []) {
        if (edge.sourceHandle === undefined) {
          continue;
        }
        const sourceNode = nodesById.get(edge.source);
        const actionId = sourceNode ? readActionId(sourceNode) : null;
        if (!actionId) {
          // Workflow inputs and other native nodes emit scalars, which the
          // engine delivers whole whatever the handle is called.
          continue;
        }
        const outputSchema = getActionDefinition(actionId)?.outputSchema;
        if (!outputCarriesHandle(outputSchema, edge.sourceHandle)) {
          unresolved.push(`${templateId}:${edge.id}`);
        }
      }
    }

    expect(unresolved.sort()).toEqual([...KNOWN_UNRESOLVED_SOURCE_HANDLES]);
  });

  it('uses only dollar-brace placeholders that the template declares as inputs', () => {
    const undeclared: string[] = [];

    for (const [templateId, template] of Object.entries(WORKFLOW_TEMPLATES)) {
      const declaredInputs = new Set(
        (template.inputVariables ?? []).map((variable) => variable.key),
      );
      const placeholders = new Set(
        [...JSON.stringify(template.nodes ?? []).matchAll(PLACEHOLDER_PATTERN)]
          .map((match) => match[1])
          .filter((name): name is string => typeof name === 'string'),
      );
      for (const placeholder of placeholders) {
        if (!declaredInputs.has(placeholder)) {
          undeclared.push(`${templateId}:${placeholder}`);
        }
      }
    }

    expect(undeclared.sort()).toEqual([...KNOWN_UNDECLARED_PLACEHOLDERS]);
  });

  it('keeps every showcase template off the known-defect baselines', () => {
    const showcaseIds = new Set<string>(SHOWCASE_WORKFLOW_TEMPLATE_IDS);
    const baselinedShowcase = [
      ...KNOWN_UNRESOLVED_SOURCE_HANDLES,
      ...KNOWN_UNDECLARED_PLACEHOLDERS,
    ].filter((entry) => showcaseIds.has(entry.split(':')[0] ?? ''));

    expect(baselinedShowcase).toEqual([]);
  });

  it('flags a named handle the source output contract does not declare', () => {
    const imageGenOutput = getActionDefinition('imageGen')?.outputSchema;

    expect(outputCarriesHandle(imageGenOutput, 'imageUrl')).toBe(true);
    expect(outputCarriesHandle(imageGenOutput, 'image')).toBe(false);
    expect(
      outputCarriesHandle(
        getActionDefinition('effect-captions')?.outputSchema,
        'video',
      ),
    ).toBe(false);
  });
});
