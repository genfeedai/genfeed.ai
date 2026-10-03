import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { SystemWorkflowGraphDefinition } from '@api/collections/workflows/system-workflow-definition';
import { getActionDefinition } from '@genfeedai/actions';
import { buildActionExecutionInput } from '@genfeedai/workflows/engine';
import { describe, expect, it } from 'vitest';

/**
 * Graph wiring vs. closed action contracts (#5869, #5868).
 *
 * The engine delivers every active edge into a node as an input keyed by
 * `targetHandle ?? source`, merged over the node's config. Action contracts are
 * closed (`additionalProperties: false`), so an edge handle the contract does
 * not name fails the node at run time with "must NOT have additional
 * properties" — after the definition registered cleanly. This spec resolves the
 * exact input key set each node receives and checks it against the node's
 * published input contract, for every system workflow definition module.
 */

const SOURCE_ROOTS = [
  new URL('../../../', import.meta.url),
  new URL('../../../../../workers/src/', import.meta.url),
].map((url) => fileURLToPath(url));

const DEFINITION_MODULE_PATTERN =
  /workflow[^/]*\.definitions?\.ts$|workflow-definitions?\.ts$/;
const IGNORED_MODULE_PATTERN = /\.(?:spec|service|module)\.ts$/;

/**
 * Wiring defects that already exist on master and are outside #5869 (which is
 * the `previous` ordering edge into `workflow.for-each`). Each entry is
 * `<canonicalId>/<nodeId>`. The sweep fails on any issue not listed here, and
 * fails on a listed entry that no longer reproduces, so fixing one forces its
 * removal. Do not add entries; fix the wiring or the contract instead.
 */
const KNOWN_UNRESOLVED_WIRING = new Set([
  'brand-remix.generate/reconcile-run',
  'clip.continuity.qa-one/assess-clip',
  'clip.continuity/assess-clips',
  'clip.factory/generate-remaining',
  'clip.generation/generate-remaining',
  'content.batch.generate-item.content-geo-optimizer/run-skill',
  'content.batch.generate-item.content-writing/run-skill',
  'content.batch.generate-item.image-generation/run-skill',
  'content.batch.generate-item.trend-discovery/run-skill',
  'content.batch.generate-item.trend-remix/run-skill',
  'content.production.autopilot.pipeline.image/publish',
  'content.production.autopilot.pipeline.music/publish',
  'content.production.autopilot.pipeline.video/publish',
  'paid-creative.research.ingest/finalize',
]);

type NodeIssue = {
  canonicalId: string;
  detail: string;
  nodeId: string;
};

function readRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function isSystemWorkflowDefinition(
  value: unknown,
): value is SystemWorkflowGraphDefinition {
  const candidate = readRecord(value);
  const graph = readRecord(candidate.definition);
  return (
    typeof candidate.canonicalId === 'string' &&
    Array.isArray(graph.nodes) &&
    (graph.edges === undefined || Array.isArray(graph.edges))
  );
}

function findWiringIssues(
  workflow: SystemWorkflowGraphDefinition,
): NodeIssue[] {
  const issues: NodeIssue[] = [];
  const edges = workflow.definition.edges ?? [];

  for (const node of workflow.definition.nodes ?? []) {
    const actionId = node.data?.config?.actionId;
    if (node.type !== 'genfeedAction' || typeof actionId !== 'string') {
      continue;
    }
    const action = getActionDefinition(actionId);
    const schema = readRecord(action?.inputSchema);
    const properties = readRecord(schema.properties);
    if (schema.type !== 'object' || Object.keys(properties).length === 0) {
      continue;
    }

    // Mirrors the engine: the node's static config and every active edge
    // (keyed by `targetHandle ?? source`) are merged by
    // `buildActionExecutionInput`. `inputVariableKeys` are runtime-optional, so
    // they are not asserted here.
    const edgeInputs = new Map<string, unknown>();
    for (const edge of edges) {
      if (edge.target === node.id) {
        edgeInputs.set(edge.targetHandle ?? edge.source, null);
      }
    }
    const delivered = Object.keys(
      buildActionExecutionInput(node.data.config, edgeInputs),
    );

    if (schema.additionalProperties === false) {
      const unexpected = delivered.filter((key) => !(key in properties));
      if (unexpected.length > 0) {
        issues.push({
          canonicalId: workflow.canonicalId,
          detail: `${actionId} receives undeclared input ${unexpected.join(', ')}`,
          nodeId: node.id,
        });
      }
    }
  }

  return issues;
}

async function collectSystemWorkflowDefinitions(): Promise<
  SystemWorkflowGraphDefinition[]
> {
  const modulePaths = SOURCE_ROOTS.flatMap((root) =>
    readdirSync(root, { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => `${entry.parentPath}/${entry.name}`)
      .filter(
        (file) =>
          DEFINITION_MODULE_PATTERN.test(file) &&
          !IGNORED_MODULE_PATTERN.test(file),
      ),
  );

  const definitions = new Map<string, SystemWorkflowGraphDefinition>();
  for (const modulePath of modulePaths.sort()) {
    const exports = readRecord(await import(/* @vite-ignore */ modulePath));
    for (const [exportName, exported] of Object.entries(exports)) {
      const candidates: unknown[] =
        typeof exported === 'function'
          ? exportName.startsWith('build') && exported.length === 0
            ? [(exported as () => unknown)()]
            : []
          : [exported];
      for (const candidate of candidates.flat()) {
        if (isSystemWorkflowDefinition(candidate)) {
          definitions.set(candidate.canonicalId, candidate);
        }
      }
    }
  }
  return [...definitions.values()];
}

describe('system workflow definition wiring against action contracts', () => {
  it('flags an edge handle the target contract does not declare', () => {
    const issues = findWiringIssues({
      canonicalId: 'test.bad-wiring',
      definition: {
        edges: [
          {
            id: 'a-to-b',
            source: 'a',
            target: 'b',
            targetHandle: 'notAForEachInput',
          },
        ],
        nodes: [
          {
            data: {
              config: {
                actionId: 'workflow.for-each',
                parameters: { childWorkflowId: 'child', items: [] },
              },
              label: 'For each',
            },
            id: 'b',
            position: { x: 0, y: 0 },
            type: 'genfeedAction',
          },
        ],
      },
      description: 'bad wiring fixture',
      label: 'Bad wiring',
      resultNodeId: 'b',
    });

    expect(issues).toEqual([
      expect.objectContaining({
        detail: expect.stringContaining('notAForEachInput'),
        nodeId: 'b',
      }),
    ]);
  });

  it('delivers only contract-declared inputs to every node of every system workflow', {
    timeout: 120_000,
  }, async () => {
    const definitions = await collectSystemWorkflowDefinitions();

    // Guards the discovery itself: an empty or shrunken sweep must not pass.
    const canonicalIds = definitions.map(
      (definition) => definition.canonicalId,
    );
    expect(definitions.length).toBeGreaterThan(30);
    expect(canonicalIds).toContain('trends.maintenance.refresh');
    expect(canonicalIds).toContain('trends.maintenance.scoped-refresh');

    const issues = definitions.flatMap(findWiringIssues);
    const issueKeys = new Set(
      issues.map((issue) => `${issue.canonicalId}/${issue.nodeId}`),
    );
    expect(
      issues.filter(
        (issue) =>
          !KNOWN_UNRESOLVED_WIRING.has(`${issue.canonicalId}/${issue.nodeId}`),
      ),
    ).toEqual([]);
    expect(
      [...KNOWN_UNRESOLVED_WIRING].filter((key) => !issueKeys.has(key)),
    ).toEqual([]);
  });
});
