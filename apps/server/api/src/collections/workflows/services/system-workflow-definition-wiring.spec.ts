import {
  ARTICLE_GENERATION_CHILD_WORKFLOW_ID,
  ARTICLE_REVIEW_WORKFLOW_ID,
} from '@api/collections/articles/services/article-workflow-definitions';
import { YOUTUBE_LONG_FORM_WORKFLOW_ID } from '@api/collections/workflows/services/youtube-long-form-workflow.constants';
import type { SystemWorkflowGraphDefinition } from '@api/collections/workflows/system-workflow-definition';
import { AD_SYNC_CHILD_WORKFLOW_IDS } from '@api/collections/workflows/templates/ad-automation-workflows.template';
import {
  collectSystemWorkflowDefinitions,
  PARAMETERIZED_DEFINITIONS,
} from '@api/shared/testing/system-workflow-definition-discovery';
import { getActionDefinition } from '@genfeedai/actions';
import { readRecord } from '@genfeedai/utils/data/extract.util';
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

/**
 * Real mismatches the injected-input sweep found (#5917), tracked in #6461.
 * Keyed `<canonicalId>/<nodeId>/<inputKey>`; fix them, never add to this list.
 */
const KNOWN_UNRESOLVED_WIRING = [
  'ai-influencer.daily-posts/finalize-daily-posts/request',
  'content.production.autopilot.pipeline.image/generate/request',
  'content.production.autopilot.pipeline.image/publish/request',
  'content.production.autopilot.pipeline.image/resolve-context/request',
  'content.production.autopilot.pipeline.music/generate/request',
  'content.production.autopilot.pipeline.music/publish/request',
  'content.production.autopilot.pipeline.music/resolve-context/request',
  'content.production.autopilot.pipeline.video/generate/request',
  'content.production.autopilot.pipeline.video/publish/request',
  'content.production.autopilot.pipeline.video/resolve-context/request',
  'voice.generate/execute/brandId',
  'voice.generate/execute/pinnedSkills',
  'voice.generate/execute/requestedSkillSlugs',
];

type NodeIssue = {
  canonicalId: string;
  detail: string;
  keys?: string[];
  nodeId: string;
};

function readInjectedInputKeys(data: unknown): string[] {
  const record = readRecord(data);
  const config = readRecord(record.config);
  const keys = [record.inputVariableKeys, config.inputVariableKeys].flatMap(
    (value) => (Array.isArray(value) ? value : []),
  );
  return [
    ...new Set(
      keys.filter(
        (key): key is string => typeof key === 'string' && key.length > 0,
      ),
    ),
  ];
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

    // Mirrors the engine: static config and every active edge
    // (`targetHandle ?? source`) are merged by `buildActionExecutionInput`.
    // The converter also copies supplied and default `inputVariableKeys` onto
    // the node config, so the sweep checks both the unsupplied and supplied
    // shapes. A supplied `parameters`/`payload` replaces that envelope, whose
    // contents are unknown statically, rather than delivering its own key.
    const edgeInputs = new Map<string, unknown>();
    for (const edge of edges) {
      if (edge.target === node.id) {
        edgeInputs.set(edge.targetHandle ?? edge.source, null);
      }
    }
    const injectedConfig = {
      ...node.data.config,
      ...Object.fromEntries(
        readInjectedInputKeys(node.data).map((key) => [key, null]),
      ),
    };
    const delivered = [
      ...new Set([
        ...Object.keys(buildActionExecutionInput(node.data.config, edgeInputs)),
        ...Object.keys(buildActionExecutionInput(injectedConfig, edgeInputs)),
      ]),
    ];

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
          keys: unexpected,
          nodeId: node.id,
        });
      }
    }
  }

  return issues;
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

  it('flags an injected input variable the contract does not declare', () => {
    const issues = findWiringIssues({
      canonicalId: 'test.injected-input',
      definition: {
        edges: [],
        nodes: [
          {
            data: {
              config: {
                actionId: 'workflow.for-each',
                parameters: { childWorkflowId: 'child', items: [] },
              },
              inputVariableKeys: ['notAForEachInput'],
              label: 'For each',
            },
            id: 'b',
            position: { x: 0, y: 0 },
            type: 'genfeedAction',
          },
        ],
      },
      description: 'injected input fixture',
      label: 'Injected input',
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
    expect(canonicalIds).toContain('content-loop-autopilot');
    expect(canonicalIds).toContain(AD_SYNC_CHILD_WORKFLOW_IDS.GOOGLE);
    expect(canonicalIds).toContain(AD_SYNC_CHILD_WORKFLOW_IDS.META);
    expect(canonicalIds).toContain(AD_SYNC_CHILD_WORKFLOW_IDS.TIKTOK);
    for (const definition of PARAMETERIZED_DEFINITIONS) {
      expect(canonicalIds).toContain(definition.canonicalId);
    }

    const issues = definitions.flatMap(findWiringIssues);
    const unresolved = issues.flatMap((issue) =>
      (issue.keys ?? ['']).map(
        (key) => `${issue.canonicalId}/${issue.nodeId}/${key}`,
      ),
    );
    // Both ways: a new key on any node fails, and a fixed entry must be
    // removed from the list.
    expect(
      issues.filter((issue) =>
        (issue.keys ?? ['']).some(
          (key) =>
            !KNOWN_UNRESOLVED_WIRING.includes(
              `${issue.canonicalId}/${issue.nodeId}/${key}`,
            ),
        ),
      ),
    ).toEqual([]);
    expect([...new Set(unresolved)].sort()).toEqual(
      [...KNOWN_UNRESOLVED_WIRING].sort(),
    );
  });
});
