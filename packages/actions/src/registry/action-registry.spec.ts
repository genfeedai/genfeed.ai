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
  it('contains exactly one definition for every action ID', () => {
    const ids = ALL_ACTIONS.map((action) => action.id);

    expect(new Set(ids).size).toBe(ids.length);
  });

  // Walks every schema object in the registry once; on a contended CI runner
  // the sweep can exceed the 5s default, so it carries its own budget.
  it('has no placeholder or open action contracts', { timeout: 20_000 }, () => {
    // Contract shards share schema fragments across actions. One `seen` set for
    // the whole registry validates each distinct object once instead of
    // re-walking the common fragments for every action.
    const seen = new Set<object>();
    for (const action of ALL_ACTIONS) {
      expectConcreteClosedSchema(
        action.inputSchema,
        `${action.id}.inputSchema`,
        seen,
      );
      expectConcreteClosedSchema(
        action.outputSchema,
        `${action.id}.outputSchema`,
        seen,
      );
    }
  });

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

  it('does not register visual aliases as duplicate actions', () => {
    const visualAliases = [
      'ai-avatar-video',
      'ai-generate-image',
      'ai-generate-newsletter',
      'ai-generate-post',
      'ai-generate-video',
      'ai-lip-sync',
      'ai-llm',
      'ai-prompt-constructor',
      'ai-reframe',
      'ai-text-to-speech',
      'ai-upscale',
      'ai-voice-change',
      'attach-post-ingredient',
      'cast-prompt-generator',
      'effect-color-grade',
      'generateVideo',
      'output-publish',
      'source-corpus',
    ];

    expect(
      visualAliases.filter((actionId) => getActionDefinition(actionId)),
    ).toEqual([]);
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

  it('owns the shared terminal output collector definition', () => {
    expect(getActionDefinition('workflow.collect-output')).toMatchObject({
      authorization: 'user',
      id: 'workflow.collect-output',
      visibility: 'internal',
    });
  });

  it('owns every atomic content-pipeline action used by compiled graphs', () => {
    expect(
      [
        'content.pipeline.generate-image',
        'content.pipeline.generate-music',
        'content.pipeline.generate-speech',
        'content.pipeline.generate-video',
        'content.pipeline.publish',
        'content.pipeline.resolve-context',
      ].every((actionId) => getActionDefinition(actionId)),
    ).toBe(true);
  });

  it('owns the atomic clip-generation graph actions', () => {
    expect(getActionDefinition('clip.generation.generate-one')).toBeDefined();
    expect(getActionDefinition('clip.generation.plan')).toBeDefined();
    expect(getActionDefinition('clip.handoff.prepare-publish')).toBeDefined();
    expect(getActionDefinition('clip.handoff.create-editor')).toBeDefined();
    expect(getActionDefinition('clip.handoff.link-library')).toBeDefined();
    expect(getActionDefinition('clip.continuity.begin')).toBeDefined();
    expect(getActionDefinition('clip.continuity.fail')).toBeDefined();
    expect(getActionDefinition('clip.continuity.persist-report')).toBeDefined();
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

  it('owns atomic recurring-product actions launched by system sweeps', () => {
    expect(
      [
        'engagement.sweep.discover',
        'engagement.sweep.evaluate',
        'review-gate.timeout.discover',
        'review-gate.timeout.resolve',
        'rss.sweep.discover-sources',
        'rss.source.fetch-items',
        'streak.sweep.discover-organizations',
        'streak.record.evaluate',
        'tiktok.status.discover',
        'tiktok.status.reconcile',
        'youtube.comments.discover-credentials',
        'youtube.status.discover-posts',
        'youtube.status.reconcile',
      ].every((actionId) => getActionDefinition(actionId)),
    ).toBe(true);
  });

  it('owns every scheduled-post workflow step', () => {
    expect(
      [
        'scheduled-post.claim',
        'scheduled-post.deliver',
        'scheduled-post.fail',
        'scheduled-post.finalize',
      ].every((actionId) => getActionDefinition(actionId)),
    ).toBe(true);
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

  it('keeps voice generation on its projected ingredient boundary', () => {
    expect(getActionDefinition('voice.generate.execute')?.outputSchema).toEqual(
      {
        additionalProperties: false,
        properties: {
          cdnUrl: { type: 'string' },
          duration: { type: 'number' },
          id: { type: 'string' },
          s3Key: { type: 'string' },
          status: {
            enum: [
              'ARCHIVED',
              'DRAFT',
              'FAILED',
              'GENERATED',
              'PROCESSING',
              'REJECTED',
              'UPLOADED',
              'VALIDATED',
            ],
            type: 'string',
          },
        },
        required: ['id', 'status'],
        type: 'object',
      },
    );
  });

  it('marks editor-installable workflow actions explicitly', () => {
    expect(getActionDefinition('imageGen')?.visibility).toBe('workflow');
    expect(getActionDefinition('socialRead')?.visibility).toBe('workflow');
    expect(
      ALL_ACTIONS.filter((action) => action.visibility === 'workflow').length,
    ).toBeGreaterThan(0);
  });
});
