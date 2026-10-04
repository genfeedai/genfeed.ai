import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  ARTICLE_GENERATION_CHILD_WORKFLOW_ID,
  ARTICLE_REVIEW_WORKFLOW_ID,
} from '@api/collections/articles/services/article-workflow-definitions';
import { buildSocialInboxOutboundWorkflowDefinition } from '@api/collections/social-inbox/services/social-inbox-outbound-workflow-definition';
import { WORKFLOW_ARTIFACT_ACTION_IDS } from '@api/collections/workflows/services/workflow-artifact-lifecycle.service';
import {
  buildWorkflowArtifactCleanupExecutionDefinition,
  buildWorkflowArtifactCleanupSweepDefinition,
  buildWorkflowArtifactExpiredScopeDefinition,
} from '@api/collections/workflows/services/workflow-artifact-workflow-definition';
import { YOUTUBE_LONG_FORM_WORKFLOW_ID } from '@api/collections/workflows/services/youtube-long-form-workflow.constants';
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
 * Definition factories that take arguments cannot be discovered by arity, so
 * every registered variant is listed with the arguments its registrar passes.
 * `register*(runner)` modules are discovered separately through a capturing
 * runner.
 */
const PARAMETERIZED_DEFINITIONS: SystemWorkflowGraphDefinition[] = [
  buildSocialInboxOutboundWorkflowDefinition('dm'),
  buildSocialInboxOutboundWorkflowDefinition('reply'),
  buildWorkflowArtifactCleanupExecutionDefinition(
    WORKFLOW_ARTIFACT_ACTION_IDS.CLEANUP,
  ),
  buildWorkflowArtifactExpiredScopeDefinition(
    WORKFLOW_ARTIFACT_ACTION_IDS.CLEANUP_EXPIRED_SCOPE,
  ),
  buildWorkflowArtifactCleanupSweepDefinition(
    WORKFLOW_ARTIFACT_ACTION_IDS.DISCOVER_EXPIRED,
  ),
];

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
      const patterns = Object.keys(readRecord(schema.patternProperties)).map(
        (pattern) => new RegExp(pattern),
      );
      const unexpected = delivered.filter(
        (key) =>
          !(key in properties) &&
          !patterns.some((pattern) => pattern.test(key)),
      );
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

  const definitions = new Map<string, SystemWorkflowGraphDefinition>(
    PARAMETERIZED_DEFINITIONS.map((definition) => [
      definition.canonicalId,
      definition,
    ]),
  );
  for (const modulePath of modulePaths.sort()) {
    const exports = readRecord(await import(/* @vite-ignore */ modulePath));
    for (const [exportName, exported] of Object.entries(exports)) {
      const candidates: unknown[] = [];
      if (typeof exported !== 'function') {
        candidates.push(exported);
      } else if (exported.length === 0) {
        candidates.push((exported as () => unknown)());
      } else if (exportName.startsWith('register') && exported.length === 1) {
        // Registrar modules hand definitions straight to the runner.
        (exported as (runner: unknown) => void)({
          registerWorkflow: (definition: unknown) => {
            candidates.push(definition);
          },
        });
      }
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
    expect(canonicalIds).toContain(ARTICLE_GENERATION_CHILD_WORKFLOW_ID);
    expect(canonicalIds).toContain(ARTICLE_REVIEW_WORKFLOW_ID);
    expect(canonicalIds).toContain(YOUTUBE_LONG_FORM_WORKFLOW_ID);
    for (const definition of PARAMETERIZED_DEFINITIONS) {
      expect(canonicalIds).toContain(definition.canonicalId);
    }

    expect(definitions.flatMap(findWiringIssues)).toEqual([]);
  });
});
