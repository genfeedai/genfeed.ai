import { describe, expect, it } from 'vitest';
import {
  ALL_ACTIONS,
  createGenfeedActionNode,
  getActionDefinition,
} from './action-registry';
import { countExplicitActionContracts } from './contracts/explicit-action-contracts';
import {
  JSON_DOCUMENT_SCHEMA,
  materializeJsonDocumentSchema,
} from './contracts/schema-builders';

function expectConcreteClosedSchema(
  schema: unknown,
  path: string,
  seen = new Set<object>(),
): void {
  expect(schema, `${path} must be a schema object`).toBeTypeOf('object');
  expect(schema, `${path} must not be null`).not.toBeNull();
  expect(Array.isArray(schema), `${path} must not be an array`).toBe(false);
  const record = schema as Record<string, unknown>;
  if (seen.has(record)) return;
  seen.add(record);
  expect(
    Object.keys(record).length,
    `${path} must not be empty`,
  ).toBeGreaterThan(0);

  const type = record.type;
  if (type === 'object' || (Array.isArray(type) && type.includes('object'))) {
    expect(
      record.additionalProperties,
      `${path} must close additional properties`,
    ).not.toBe(true);
    expect(
      record.additionalProperties,
      `${path} must declare additional properties behavior`,
    ).not.toBeUndefined();
  }
  if (type === 'array' || (Array.isArray(type) && type.includes('array'))) {
    expect(record.items, `${path} arrays must declare items`).toBeDefined();
  }

  for (const keyword of [
    'additionalProperties',
    'contains',
    'else',
    'if',
    'items',
    'not',
    'then',
  ]) {
    const nested = record[keyword];
    if (nested && typeof nested === 'object') {
      expectConcreteClosedSchema(nested, `${path}.${keyword}`, seen);
    }
  }
  for (const keyword of ['allOf', 'anyOf', 'oneOf', 'prefixItems']) {
    const nested = record[keyword];
    if (Array.isArray(nested)) {
      nested.forEach((candidate, index) => {
        expectConcreteClosedSchema(
          candidate,
          `${path}.${keyword}[${index}]`,
          seen,
        );
      });
    }
  }
  for (const keyword of ['properties', 'patternProperties', '$defs']) {
    const nested = record[keyword];
    if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
      for (const [key, candidate] of Object.entries(nested)) {
        expectConcreteClosedSchema(
          candidate,
          `${path}.${keyword}.${key}`,
          seen,
        );
      }
    }
  }
}

describe('Genfeed action registry', () => {
  // Walks every schema object in the registry once; on a contended CI runner
  // the sweep can exceed the 5s default, so it carries its own budget.

  it('materializes every recursive JSON document marker before publication', () => {
    // The engine compiles published schemas directly. An unmaterialized marker
    // is annotation-only, so it fails contract compilation at API bootstrap
    // rather than at registration time.
    for (const action of ALL_ACTIONS) {
      expect(
        JSON.stringify(action.inputSchema),
        `${action.id}.inputSchema`,
      ).not.toContain('genfeed:recursive-json-document');
      expect(
        JSON.stringify(action.outputSchema),
        `${action.id}.outputSchema`,
      ).not.toContain('genfeed:recursive-json-document');
    }
  });

  it('maps every non-tool catalog action to exactly one explicit contract shard', () => {
    for (const action of ALL_ACTIONS.filter(
      (definition) => definition.visibility !== 'tool',
    )) {
      expect(countExplicitActionContracts(action.id), action.id).toBe(1);
    }
  });

  it('limits dynamic root pass-through contracts to engine control boundaries', () => {
    const dynamicRootActions = [
      'workflow.collect-output',
      'workflow.run-child',
    ];
    const recursiveJsonDocument =
      materializeJsonDocumentSchema(JSON_DOCUMENT_SCHEMA);
    for (const actionId of dynamicRootActions) {
      expect(getActionDefinition(actionId)?.outputSchema).toEqual(
        recursiveJsonDocument,
      );
    }
    expect(
      ALL_ACTIONS.filter(
        (action) =>
          action.visibility !== 'tool' &&
          JSON.stringify(action.outputSchema) ===
            JSON.stringify(recursiveJsonDocument),
      )
        .map((action) => action.id)
        // Catalog order is not a contract — the membership of the pass-through
        // set is what this guard pins.
        .sort(),
    ).toEqual(dynamicRootActions);
  });

  it('publishes exact YouTube long-form and artifact contracts', () => {
    expect(getActionDefinition('youtube.resolve-source')?.inputSchema).toEqual({
      additionalProperties: false,
      properties: {
        youtubeUrl: { minLength: 1, type: 'string' },
      },
      required: ['youtubeUrl'],
      type: 'object',
    });
    expect(
      getActionDefinition('long-form.transform-text')?.outputSchema,
    ).toMatchObject({
      additionalProperties: false,
      properties: {
        content: { minLength: 1, type: 'string' },
        outputType: {
          enum: ['article', 'linkedin-article', 'newsletter', 'x-article'],
          type: 'string',
        },
        summary: { minLength: 1, type: 'string' },
        title: { minLength: 1, type: 'string' },
      },
      required: [
        'content',
        'outputType',
        'summary',
        'title',
        'videoId',
        'youtubeUrl',
      ],
      type: 'object',
    });
    expect(
      getActionDefinition('workflow.artifact.register')?.outputSchema,
    ).toEqual({
      additionalProperties: false,
      properties: {
        artifactId: { minLength: 1, type: 'string' },
        expiresAt: { format: 'date-time', type: 'string' },
        state: { minLength: 1, type: 'string' },
      },
      required: ['artifactId', 'expiresAt', 'state'],
      type: 'object',
    });
  });

  it('publishes closed contracts for every Brand Remix generation action', () => {
    for (const actionId of [
      'brand-remix.scene-step',
      'brand-remix.generate.adopt-orphans',
      'brand-remix.generate.claim',
      'brand-remix.generate.clear-claim',
      'brand-remix.generate.dispatch-variant',
      'brand-remix.generate.reconcile',
      'brand-remix.generate.reserve-credits',
      'brand-remix.generate.resolve-variant-credits',
    ]) {
      const action = getActionDefinition(actionId);
      expect(action, actionId).toBeDefined();
      expect(action?.inputSchema).toMatchObject({
        additionalProperties: false,
        type: 'object',
      });
      expect(action?.outputSchema).toMatchObject({
        additionalProperties: false,
        type: 'object',
      });
    }
  });

  it('publishes closed contracts for every decomposed automation action', () => {
    for (const actionId of [
      'agent.autopilot.discover',
      'content.production.engine.execute-plan-item',
      'content.production.autopilot.prepare-persona',
      'harness.winners.promote-item',
      'livestream.sessions.deliver-target',
      'paid-creative.research.ingest-advertiser',
      'reply.polling.social.process-trigger',
      'trends.notifications.render',
    ]) {
      const action = getActionDefinition(actionId);
      expect(action).toBeDefined();
      expect(action?.inputSchema).toMatchObject({
        additionalProperties: false,
        type: 'object',
      });
      expect(action?.outputSchema).toMatchObject({
        additionalProperties: false,
        type: 'object',
      });
    }
  });

  it('generates action nodes from registered definitions', () => {
    expect(
      createGenfeedActionNode({
        actionId: 'youtube.resolve-source',
        id: 'resolve-source',
        inputVariableKeys: ['youtubeUrl'],
        parameters: { includeMetadata: true },
      }),
    ).toEqual({
      data: {
        config: {
          actionId: 'youtube.resolve-source',
          parameters: { includeMetadata: true },
        },
        inputVariableKeys: ['youtubeUrl'],
        label: 'Resolve YouTube Source',
      },
      id: 'resolve-source',
      position: { x: 0, y: 120 },
      type: 'genfeedAction',
    });
  });

  it('fails closed for an unknown action ID', () => {
    expect(getActionDefinition('not-an-action')).toBeUndefined();
    expect(() =>
      createGenfeedActionNode({
        actionId: 'not-an-action',
        id: 'unknown',
      }),
    ).toThrow('Unknown Genfeed action: not-an-action');
  });

  it('owns the batch project idea dispatch actions with closed job contracts', () => {
    for (const actionId of [
      'batch-project.idea.dispatch-item',
      'batch-project.idea.fail-item',
    ]) {
      const definition = getActionDefinition(actionId);
      expect(definition).toMatchObject({
        authorization: 'system',
        id: actionId,
        visibility: 'internal',
      });
      expect(definition?.inputSchema).toMatchObject({
        additionalProperties: false,
        required: ['job'],
      });
    }
  });

  it('publishes exact public YouTube clip session boundaries', () => {
    expect(
      getActionDefinition('youtube.clip.create-session')?.inputSchema,
    ).toMatchObject({
      additionalProperties: false,
      properties: {
        idempotencyKey: { type: 'string' },
        source: {
          additionalProperties: false,
          required: ['title', 'videoId', 'youtubeUrl'],
          type: 'object',
        },
      },
      required: ['source'],
      type: 'object',
    });
    expect(
      getActionDefinition('youtube.clip.read-session')?.outputSchema,
    ).toMatchObject({
      additionalProperties: false,
      required: [
        'expiresAt',
        'id',
        'preview',
        'previewToken',
        'progress',
        'recommendations',
        'status',
        'transcript',
      ],
      type: 'object',
    });
    expect(
      getActionDefinition('clip.analysis.prepare-source')?.inputSchema,
    ).toMatchObject({
      additionalProperties: false,
      required: ['job'],
      type: 'object',
    });
  });

  it('hard-cuts workspace agent tasks to workflow executions', () => {
    for (const retiredId of [
      'workspace.task.agent.link-runs',
      'workspace.task.agent.plan-runs',
      'workspace.task.agent.record-run',
      'workspace.task.agent.run.create',
      'workspace.task.agent.run.enqueue',
    ]) {
      expect(getActionDefinition(retiredId)).toBeUndefined();
    }
    expect(
      getActionDefinition('workspace.task.agent.plan-executions')?.outputSchema,
    ).toMatchObject({
      additionalProperties: false,
      required: ['items'],
      type: 'object',
    });
    expect(
      getActionDefinition('workspace.task.agent.link-executions')?.outputSchema,
    ).toMatchObject({
      additionalProperties: false,
      required: ['executionIds', 'taskId'],
      type: 'object',
    });
  });

  it('owns exact workflow-backed built-in skill boundaries', () => {
    for (const actionId of [
      'skill.content-geo-optimizer.execute',
      'skill.content-writing.execute',
      'skill.image-generation.execute',
      'skill.trend-discovery.execute',
      'skill.trend-remix.execute',
    ]) {
      const action = getActionDefinition(actionId);
      expect(action?.inputSchema).toMatchObject({
        additionalProperties: false,
        required: ['context', 'params'],
        type: 'object',
      });
      expect(action?.outputSchema).toMatchObject({
        additionalProperties: false,
        required: ['content', 'metadata', 'platforms', 'skillSlug', 'type'],
        type: 'object',
      });
    }
  });

  it('owns scoped trend maintenance and retires adaptive backfill actions', () => {
    for (const actionId of [
      'trends.maintenance.discover-scoped',
      'trends.maintenance.fetch-scoped',
    ]) {
      expect(getActionDefinition(actionId)?.visibility).toBe('internal');
    }

    expect(
      getActionDefinition('trends.maintenance.evaluate-backfill'),
    ).toBeUndefined();
    expect(
      getActionDefinition('trends.maintenance.finalize-backfill'),
    ).toBeUndefined();
  });

  it('owns the internal workflow artifact lifecycle actions', () => {
    for (const actionId of [
      'workflow.artifact.cleanup',
      'workflow.artifact.cleanup-expired-scope',
      'workflow.artifact.discover-expired',
      'workflow.artifact.promote',
      'workflow.artifact.register',
    ]) {
      const definition = getActionDefinition(actionId);
      expect(definition).toBeDefined();
      expect(definition?.visibility).toBe('internal');
    }
  });

  it('owns the generic and hidden-system tenant fan-out actions', () => {
    for (const actionId of [
      'workflow.for-each',
      'workflow.for-each-tenant',
      'workflow.run-child',
    ]) {
      const definition = getActionDefinition(actionId);
      expect(definition).toBeDefined();
      expect(definition?.visibility).toBe('internal');
    }
  });

  it('pins batch child versions and collects exact failure results', () => {
    const definition = getActionDefinition('workflow.for-each');
    const inputSchema = definition?.inputSchema as {
      properties?: Record<string, unknown>;
      required?: string[];
    };
    const outputSchema = definition?.outputSchema as {
      properties?: {
        results?: { items?: { oneOf?: unknown[] } };
      };
    };

    expect(inputSchema.required).toContain('childWorkflowId');
    expect(inputSchema.required).not.toContain('childWorkflowVersionId');
    expect(inputSchema.properties?.childWorkflowVersionId).toEqual({
      minLength: 1,
      type: 'string',
    });
    expect(inputSchema.properties?.failureMode).toEqual({
      enum: ['fail-fast', 'collect'],
      type: 'string',
    });
    expect(outputSchema.properties?.results?.items?.oneOf).toContainEqual({
      additionalProperties: false,
      properties: {
        error: { minLength: 1, type: 'string' },
        executionId: { minLength: 1, type: 'string' },
        index: { type: 'integer' },
        status: { enum: ['failed'], type: 'string' },
      },
      required: ['error', 'index', 'status'],
      type: 'object',
    });
  });

  it('hard-cuts YouTube transcription into atomic workflow actions', () => {
    expect(getActionDefinition('youtube.obtain-transcript')).toBeUndefined();
    expect(
      [
        'youtube.create-source-library-asset',
        'youtube.extract-audio',
        'youtube.plan-source-library-asset',
        'youtube.transcribe-audio',
      ].every((actionId) => getActionDefinition(actionId)),
    ).toBe(true);
    expect(getActionDefinition('youtube.extract-audio')?.credits).toEqual({
      amount: 0,
      mode: 'fixed',
    });
    expect(getActionDefinition('youtube.transcribe-audio')?.credits).toEqual({
      mode: 'dynamic',
    });
  });

  it('owns workflow credit policy instead of delegating it to the engine', () => {
    expect(getActionDefinition('imageGen')?.credits).toEqual({
      amount: 5,
      mode: 'fixed',
    });
    expect(getActionDefinition('videoGen')?.credits).toEqual({
      amount: 10,
      mode: 'fixed',
    });
    expect(getActionDefinition('long-form.transform-text')?.credits).toEqual({
      mode: 'dynamic',
    });
  });

  it('declares provider-callback completion without inferring from status', () => {
    const providerCallbackIds = [
      'aiAvatarVideo',
      'imageGen',
      'lipSync',
      'reframe',
      'upscale',
      'videoGen',
      'workspace.task.facecam.generate',
    ];

    expect(
      ALL_ACTIONS.filter(
        (action) => action.completionMode === 'provider-callback',
      ).map((action) => action.id),
    ).toEqual(providerCallbackIds);
    expect(getActionDefinition('effect-captions')?.completionMode).toBe(
      'synchronous',
    );
    expect(getActionDefinition('videoStitch')?.completionMode).toBe(
      'synchronous',
    );
  });

  it('marks editor-installable workflow actions explicitly', () => {
    expect(getActionDefinition('imageGen')?.visibility).toBe('workflow');
    expect(getActionDefinition('socialRead')?.visibility).toBe('workflow');
    const workflowActions = ALL_ACTIONS.filter(
      (action) => action.visibility === 'workflow',
    );

    expect(workflowActions.length).toBeGreaterThan(0);
    expect(
      workflowActions.every(
        (action) => action.workflowCategory && action.workflowIcon,
      ),
    ).toBe(true);
    expect(
      new Set(workflowActions.map((action) => action.workflowCategory)),
    ).toEqual(new Set(['input', 'ai', 'processing', 'composition', 'output']));
    expect(getActionDefinition('imageGen')).toMatchObject({
      workflowCategory: 'ai',
      workflowIcon: 'Image',
    });
    expect(getActionDefinition('socialRead')).toMatchObject({
      workflowCategory: 'input',
      workflowIcon: 'Search',
    });
    expect(getActionDefinition('publish')).toMatchObject({
      workflowCategory: 'output',
      workflowIcon: 'Navigation',
    });
  });

  it('derives Knowledge workflow visibility from the curated catalog', () => {
    const knowledgeWorkflowActions = ALL_ACTIONS.filter(
      (action) =>
        action.visibility === 'workflow' &&
        (action.id.endsWith('_knowledge') ||
          action.id.includes('knowledge_source') ||
          action.id.includes('knowledge_ingestion') ||
          action.id.includes('knowledge_purpose')),
    );

    expect(knowledgeWorkflowActions.map((action) => action.id).sort()).toEqual([
      'archive_knowledge_source',
      'assign_knowledge_purpose',
      'capture_knowledge',
      'list_knowledge_sources',
      'read_knowledge_source',
      'retry_knowledge_ingestion',
      'search_knowledge',
    ]);
    expect(
      knowledgeWorkflowActions.every(
        (action) =>
          action.workflowCategory === 'input' &&
          action.workflowIcon === 'BookOpen',
      ),
    ).toBe(true);
    expect(getActionDefinition('search_knowledge')?.visibility).toBe(
      'workflow',
    );
    expect(getActionDefinition('create_post')?.visibility === 'workflow').toBe(
      false,
    );
  });
});
