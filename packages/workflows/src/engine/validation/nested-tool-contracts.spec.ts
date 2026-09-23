import {
  ALL_ACTIONS,
  ALL_TOOLS,
  getActionDefinition,
  toAgentTools,
  toMcpTools,
} from '@genfeedai/actions';
import Ajv from 'ajv';
import { describe, expect, it } from 'vitest';
import {
  type ActionContractJsonSchema,
  compileActionContract,
} from './action-contract';

const provenance = {
  nodeId: 'execute-tool',
  runId: 'run-contract-audit',
  workflowId: 'tool-contract-audit',
  workflowVersionId: 'v1',
};
const metric = {
  id: 'total',
  type: 'metric_card',
  sourceKey: 'totalPosts',
  value: 12,
  trend: { direction: 'up', percentage: 5 },
};
const fixtures = [
  {
    id: 'execute_workflow',
    input: {
      workflowId: 'workflow-1',
      variables: {
        topic: 'AI',
        enabled: true,
        sources: [{ tags: ['a'], options: { depth: 2, fallback: null } }],
      },
    },
  },
  {
    id: 'create_workflow',
    input: {
      label: 'Test',
      nodes: [
        {
          id: 'n1',
          type: 'genfeedAction',
          position: { x: 0, y: 0 },
          data: {
            label: 'Generate',
            config: { actionId: 'generate_image', inputs: { prompt: 'A cat' } },
          },
        },
      ],
      edges: [{ id: 'e1', source: 'n1', target: 'n2' }],
      inputVariables: [
        {
          key: 'topic',
          label: 'Topic',
          type: 'text',
          defaultValue: 'AI',
          validation: { min: 1 },
        },
      ],
      metadata: { custom: { tags: ['campaign'] } },
    },
  },
  {
    id: 'capture_memory',
    input: {
      content: 'Winning post',
      performanceSnapshot: {
        impressions: 100,
        platforms: { twitter: { clicks: 8 } },
      },
    },
  },
  {
    id: 'request_asset',
    input: {
      targetAgentId: 'agent-1',
      assetType: 'image',
      prompt: 'A cat',
      specifications: { aspectRatio: '1:1', reference: { palette: ['red'] } },
    },
  },
  {
    id: 'save_brand_voice_profile',
    input: {
      voiceProfile: {
        tone: 'Warm',
        audience: ['Founders'],
        style: 'Direct',
        strategy: { goals: ['Growth'], topics: ['AI'] },
        prompting: {
          seeds: [
            {
              topic: 'AI',
              angle: 'Practical',
              audience: 'Founders',
              preferredFormats: ['post'],
            },
          ],
          conversationStarters: [
            {
              id: 'start',
              label: 'Create a post',
              prompt: 'Write about AI',
              topic: 'AI',
              intent: 'create',
            },
          ],
        },
      },
    },
  },
  {
    id: 'render_dashboard',
    input: {
      operation: 'replace',
      blocks: [
        metric,
        { id: 'kpis', type: 'kpi_grid', cards: [metric] },
        {
          id: 'chart',
          type: 'chart',
          chartType: 'line',
          data: [{ date: '2026-09-23', views: 12 }],
          series: [{ key: 'views', label: 'Views', color: 'blue' }],
        },
        {
          id: 'table',
          type: 'table',
          columns: [
            { key: 'name', label: 'Name', sortable: true, align: 'left' },
          ],
          rows: [{ name: 'Test', extra: { enabled: true } }],
        },
      ],
    },
  },
  {
    id: 'save_dashboard_layout',
    input: { brandId: 'brand', version: 2, blocks: [metric] },
  },
  {
    id: 'get_dashboard_layout',
    input: { brandId: 'brand', pageKey: 'overview' },
  },
  {
    id: 'save_dashboard_layout',
    input: {
      document: {
        components: [
          {
            component: 'Dashboard.Stack',
            props: { id: 'group', layout: 'row' },
            children: [
              {
                component: 'Dashboard.MetricCard',
                props: { id: 'total', value: 12, sourceKey: 'totalPosts' },
              },
            ],
          },
        ],
      },
    },
  },
  {
    id: 'save_dashboard_layout',
    input: {
      document: {
        version: 'genfeed.dashboard.openui.v1',
        blocks: [
          { id: 'group', type: 'composite', layout: 'row', blocks: [metric] },
        ],
      },
    },
  },
  {
    id: 'transfer_agent_conversation',
    input: {
      content: 'Continue here',
      deliveryMode: 'SEND',
      idempotencyKey: 'handoff-1',
      artifactReferences: [
        {
          kind: 'post',
          recordId: 'post-1',
          organizationId: 'org-1',
          serializer: 'post',
        },
      ],
      selectedContext: { campaign: { topics: ['AI'], enabled: true } },
    },
  },
  {
    id: 'create_scheduled_release',
    input: {
      release: {
        title: 'Launch',
        baseContent: 'Hello',
        timezone: 'UTC',
        targets: [
          {
            credentialId: 'credential-1',
            platform: 'youtube',
            settings: {
              title: 'Launch',
              tags: ['AI'],
              options: { notify: true },
            },
          },
        ],
      },
    },
  },
  {
    id: 'update_scheduled_release',
    input: {
      releaseId: 'release-1',
      scope: 'target',
      changes: { settings: { title: 'Updated', tags: ['AI'] } },
    },
  },
  {
    id: 'validate_scheduler_target',
    input: { platform: 'youtube', settings: { title: 'Launch', tags: ['AI'] } },
  },
];

function validateInput(id: string, input: unknown): void {
  const action = getActionDefinition(id);
  if (!action) throw new Error(`Missing action ${id}`);
  compileActionContract(id, {
    inputSchema: action.inputSchema as ActionContractJsonSchema,
    outputSchema: action.outputSchema as ActionContractJsonSchema,
  }).validateInput(input, provenance);
}

describe('nested tool input contracts', () => {
  it.each(fixtures)(
    'accepts supported nested input for $id',
    ({ id, input }) => {
      expect(() => validateInput(id, input)).not.toThrow();
    },
  );

  it.each(fixtures)(
    'publishes a usable Agent/MCP schema for $id',
    ({ id, input }) => {
      const tools = ALL_TOOLS.filter((tool) => tool.name === id);
      const schemas = [
        ...toAgentTools(tools).map((tool) => tool.parameters),
        ...toMcpTools(tools).map((tool) => tool.inputSchema),
      ];
      expect(schemas.length).toBeGreaterThan(0);
      for (const schema of schemas) {
        const validate = new Ajv({
          allowUnionTypes: true,
          strict: true,
        }).compile(schema);
        expect(validate(input), JSON.stringify(validate.errors)).toBe(true);
      }
    },
  );

  it.each([
    [
      'execute_workflow',
      { workflowId: 'wf', variables: { invalid: undefined } },
    ],
    ['execute_workflow', { workflowId: 'wf', variables: [] }],
    [
      'capture_memory',
      { content: 'Post', performanceSnapshot: { invalid: undefined } },
    ],
    [
      'request_asset',
      {
        targetAgentId: 'agent',
        assetType: 'image',
        prompt: 'Cat',
        specifications: 'wrong',
      },
    ],
    [
      'save_dashboard_layout',
      { document: { components: [{ component: 'Dashboard.Unknown' }] } },
    ],
    [
      'render_dashboard',
      {
        operation: 'replace',
        blocks: [{ id: 'chart', type: 'chart', chartType: 'funnel' }],
      },
    ],
    [
      'render_dashboard',
      {
        operation: 'replace',
        blocks: [{ id: 'heading', type: 'section_header', level: 4 }],
      },
    ],
    ['save_brand_voice_profile', { voiceProfile: { tone: 7 } }],
    ['save_brand_voice_profile', { voiceProfile: { typo: true } }],
    [
      'render_dashboard',
      {
        operation: 'replace',
        blocks: [
          { ...metric, trend: { direction: 'sideways', percentage: 5 } },
        ],
      },
    ],
    [
      'render_dashboard',
      {
        operation: 'replace',
        blocks: [
          { id: 'table', type: 'table', columns: [{ key: 'name', label: 3 }] },
        ],
      },
    ],
    [
      'transfer_agent_conversation',
      {
        content: 'Hi',
        deliveryMode: 'SEND',
        idempotencyKey: 'key',
        artifactReferences: [
          {
            kind: 'post',
            recordId: 'post',
            organizationId: 'org',
            serializer: 'asset',
          },
        ],
      },
    ],
    [
      'create_workflow',
      { label: 'Test', nodes: [{ id: 'n1', position: { x: 'wrong', y: 0 } }] },
    ],
    [
      'validate_scheduler_target',
      { platform: 'youtube', settings: { invalid: undefined } },
    ],
  ])('rejects malformed nested input for %s', (id, input) => {
    expect(() => validateInput(id as string, input)).toThrow();
  });
});

function findImplicitEmptyObjects(value: unknown, path: string): string[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  const schema = value as Record<string, unknown>;
  const types = Array.isArray(schema.type) ? schema.type : [schema.type];
  const failures =
    types.includes('object') &&
    schema.properties === undefined &&
    schema.patternProperties === undefined &&
    typeof schema.additionalProperties !== 'object' &&
    schema.maxProperties !== 0
      ? [path]
      : [];
  for (const keyword of [
    'properties',
    'patternProperties',
    '$defs',
    'definitions',
  ]) {
    for (const [key, child] of Object.entries(
      (schema[keyword] ?? {}) as Record<string, unknown>,
    ))
      failures.push(
        ...findImplicitEmptyObjects(child, `${path}.${keyword}.${key}`),
      );
  }
  for (const keyword of [
    'items',
    'additionalProperties',
    'if',
    'then',
    'else',
    'not',
    'contains',
  ])
    failures.push(
      ...findImplicitEmptyObjects(schema[keyword], `${path}.${keyword}`),
    );
  for (const keyword of ['anyOf', 'oneOf', 'allOf', 'prefixItems']) {
    if (Array.isArray(schema[keyword]))
      schema[keyword].forEach((child, index) => {
        failures.push(
          ...findImplicitEmptyObjects(child, `${path}.${keyword}[${index}]`),
        );
      });
  }
  return failures;
}

it('declares fields, a typed map, or intentional emptiness for every published object schema', () => {
  const failures = ALL_ACTIONS.flatMap((action) =>
    ['inputSchema', 'outputSchema'].flatMap((boundary) =>
      findImplicitEmptyObjects(
        action[boundary as 'inputSchema' | 'outputSchema'],
        `${action.id}.${boundary}`,
      ),
    ),
  );
  expect(failures).toEqual([]);
});

it('compiles every advertised Agent and MCP schema with its shared definitions', () => {
  const schemas = [
    ...toAgentTools(ALL_TOOLS).map((tool) => ({
      name: tool.name,
      schema: tool.parameters,
    })),
    ...toMcpTools(ALL_TOOLS).map((tool) => ({
      name: tool.name,
      schema: tool.inputSchema,
    })),
  ];
  const failures: string[] = [];
  for (const { name, schema } of schemas) {
    try {
      new Ajv({ allowUnionTypes: true, strict: true }).compile(schema);
    } catch (error) {
      failures.push(
        `${name}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  expect(failures).toEqual([]);
});
