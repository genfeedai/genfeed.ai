import type { ConfigService } from '@libs/config/config.service';
import type { LoggerService } from '@libs/logger/logger.service';
import { BaseApiClient } from '@mcp/services/client/base-api-client';
import { RemixClient } from '@mcp/services/client/remix.client';
import { McpUpstreamError } from '@mcp/tools/mcp-tool-error';
import type { HttpService } from '@nestjs/axios';
import { beforeEach, describe, expect, it } from 'vitest';

interface Quote {
  id: string;
  model?: unknown;
  operation?: unknown;
  repairStage?: unknown;
  sceneId?: unknown;
}

interface Run {
  analysisAssetId?: unknown;
  brandId: string;
  concept: Record<string, unknown>;
  draft: { output: { kind: string } };
  executedQuoteId?: unknown;
  generationQuote?: Quote;
  revision: number;
  scenePipeline?: { quote?: Quote; status?: string };
  sourcePostId: unknown;
}

type Body = Record<string, unknown>;

const RUN_ID = 'run:1';

const upstreamError = (status: number, detail: string) => ({
  response: { data: { errors: [{ detail }] }, status },
});

describe('RemixClient', () => {
  let runs: Map<string, Run>;
  let sourcePosts: Map<string, { brandId: string; id: string }>;
  let writes: number;
  let isApiFailing: number | undefined;
  let nextKind: string;
  let client: RemixClient;

  const createRun = (kind: string) => {
    nextKind = kind;
    return client.createRemixConcept({
      brandId: 'brand:1',
      sourcePostId: 'source-1',
    });
  };
  const runOf = () => runs.get(RUN_ID);

  beforeEach(() => {
    runs = new Map();
    sourcePosts = new Map();
    writes = 0;
    isApiFailing = undefined;
    nextKind = 'image';

    // The canonical API: remix routes with revision checks, answering
    // JSON:API resources the way the public API does.
    const resource = (id: string) => {
      const run = runs.get(id);
      if (!run) throw upstreamError(404, 'Remix run not found');
      return { data: { data: { attributes: { ...run }, id } } };
    };
    const bump = (run: Run, body: Body) => {
      if (body.expectedRevision !== run.revision) {
        throw upstreamError(409, 'Remix revision changed');
      }
      run.revision += 1;
    };
    const routes: [RegExp, (match: string[], body: Body) => unknown][] = [
      [
        /^post \/social-sources\/import-post\?brandId=(.+)$/,
        ([, brand], body) => {
          const url = String(body.url);
          const existing = sourcePosts.get(url);
          const post = existing ?? {
            brandId: decodeURIComponent(brand ?? ''),
            id: `source-post-${sourcePosts.size + 1}`,
          };
          sourcePosts.set(url, post);
          return {
            data: {
              deduplicated: Boolean(existing),
              post: { id: post.id },
              source: { id: 'source-1' },
            },
          };
        },
      ],
      [
        /^post \/brands\/([^/]+)\/content-runs\/remixes$/,
        ([, brand], body) => {
          const source = body.source as Body;
          runs.set(RUN_ID, {
            brandId: decodeURIComponent(brand ?? ''),
            concept: {},
            draft: { output: { kind: nextKind } },
            revision: 1,
            sourcePostId: source.sourcePostId,
          });
          return resource(RUN_ID);
        },
      ],
      [
        /^get \/content-runs\/([^/]+)\/remix$/,
        ([, id]) => resource(decodeURIComponent(id ?? '')),
      ],
      [
        /^patch \/content-runs\/([^/]+)\/remix$/,
        ([, id], body) => {
          const runId = decodeURIComponent(id ?? '');
          const run = runs.get(runId);
          if (!run) throw upstreamError(404, 'Remix run not found');
          bump(run, body);
          Object.assign(run.concept, (body.edits as Body).concept);
          return resource(runId);
        },
      ],
      [
        /^patch \/content-runs\/([^/]+)\/remix\/scenes\/source$/,
        (_match, body) => {
          const run = runOf() as Run;
          bump(run, body);
          run.analysisAssetId = body.assetId;
          return resource(RUN_ID);
        },
      ],
      [
        /^post \/content-runs\/([^/]+)\/remix\/generation\/quote$/,
        (_match, body) => {
          const run = runOf() as Run;
          run.generationQuote = { id: 'quote-1', model: body.model };
          return resource(RUN_ID);
        },
      ],
      [
        /^post \/content-runs\/([^/]+)\/remix\/scenes\/quote$/,
        (_match, body) => {
          const run = runOf() as Run;
          const { expectedRevision: _revision, ...quote } = body;
          run.scenePipeline = { quote: { id: 'scene-quote', ...quote } };
          return resource(RUN_ID);
        },
      ],
      [
        /^post \/content-runs\/([^/]+)\/remix\/(generation|scenes)\/execute$/,
        ([, , family], body) => {
          const run = runOf() as Run;
          run.executedQuoteId = `${family}:${body.quoteId}`;
          return resource(RUN_ID);
        },
      ],
      [
        /^post \/content-runs\/([^/]+)\/remix\/scenes\/(cancel|resume)$/,
        ([, , action], body) => {
          const run = runOf() as Run;
          bump(run, body);
          run.scenePipeline = {
            ...run.scenePipeline,
            status: action === 'cancel' ? 'cancelled' : 'running',
          };
          return resource(RUN_ID);
        },
      ],
    ];
    const handle = async (method: string, path: string, body: Body = {}) => {
      if (isApiFailing) {
        throw upstreamError(isApiFailing, 'Canonical failure');
      }
      const request = `${method} ${path}`;
      const route = routes.find(([pattern]) => pattern.test(request));
      if (!route) throw new Error(`No route for ${request}`);
      if (method !== 'get') writes += 1;
      return route[1](route[0].exec(request) ?? [], body);
    };
    const http = {
      defaults: { headers: {} },
      get: (path: string) => handle('get', path),
      patch: (path: string, body: Body) => handle('patch', path, body),
      post: (path: string, body: Body) => handle('post', path, body),
    };
    const base = new BaseApiClient(
      {
        debug: () => undefined,
        error: () => undefined,
      } as unknown as LoggerService,
      { axiosRef: { create: () => http } } as unknown as HttpService,
      { get: () => undefined } as unknown as ConfigService,
    );
    client = new RemixClient(base);
  });

  it('imports a source post into the encoded brand and keeps nested identities', async () => {
    const input = { brandId: 'brand:1', url: 'https://x.com/example/status/1' };

    await expect(client.importSourcePost(input)).resolves.toEqual({
      deduplicated: false,
      post: { id: 'source-post-1' },
      source: { id: 'source-1' },
    });
    await expect(client.importSourcePost(input)).resolves.toMatchObject({
      deduplicated: true,
      post: { id: 'source-post-1' },
    });
    expect(sourcePosts.get(input.url)?.brandId).toBe('brand:1');
  });

  it('creates, reads, revises and attaches a remix through canonical routes', async () => {
    await expect(createRun('image')).resolves.toMatchObject({
      id: RUN_ID,
      revision: 1,
    });

    await client.updateRemixConcept({
      edits: { concept: { hook: null } },
      expectedRevision: 1,
      runId: RUN_ID,
    });
    await client.attachRemixAnalysisSource({
      assetId: null,
      expectedRevision: 2,
      runId: RUN_ID,
    });

    await expect(client.getRemixRun({ runId: RUN_ID })).resolves.toEqual({
      analysisAssetId: null,
      brandId: 'brand:1',
      concept: { hook: null },
      draft: { output: { kind: 'image' } },
      id: RUN_ID,
      revision: 3,
      sourcePostId: 'source-1',
    });
    expect(writes).toBe(3);
  });

  it.each([
    ['image', { model: 'model-1' }, 'model-1'],
    ['copy', {}, undefined],
  ])(
    'quotes and starts %s remixes as a generation',
    async (kind, model, quotedModel) => {
      await createRun(kind);

      await client.quoteRemixGeneration({
        expectedRevision: 1,
        operation: 'generate',
        runId: RUN_ID,
        ...model,
      });
      await expect(
        client.startRemixGeneration({
          expectedRevision: 1,
          quoteId: 'quote-1',
          runId: RUN_ID,
        }),
      ).resolves.toMatchObject({ executedQuoteId: 'generation:quote-1' });
      expect(runOf()?.generationQuote).toEqual({
        id: 'quote-1',
        model: quotedModel,
      });
    },
  );

  it.each([
    ['video', { operation: 'analysis' }],
    ['avatar', { operation: 'generate' }],
    [
      'video',
      { operation: 'repair', repairStage: 'image', sceneId: 'scene-1' },
    ],
  ] as const)('quotes a %s remix scene pipeline (%o)', async (kind, quote) => {
    await createRun(kind);

    await client.quoteRemixGeneration({
      expectedRevision: 1,
      runId: RUN_ID,
      ...quote,
    });

    expect(runOf()?.scenePipeline).toEqual({
      quote: { id: 'scene-quote', ...quote },
    });
  });

  it('starts, cancels and resumes a scene pipeline', async () => {
    await createRun('video');
    await client.quoteRemixGeneration({
      expectedRevision: 1,
      operation: 'generate',
      runId: RUN_ID,
    });

    await client.startRemixGeneration({
      expectedRevision: 1,
      quoteId: 'scene-quote',
      runId: RUN_ID,
    });
    await client.controlRemixGeneration({
      action: 'cancel',
      expectedRevision: 1,
      runId: RUN_ID,
    });
    const resumed = await client.controlRemixGeneration({
      action: 'resume',
      expectedRevision: 2,
      runId: RUN_ID,
    });

    expect(resumed).toMatchObject({
      executedQuoteId: 'scenes:scene-quote',
      revision: 3,
      scenePipeline: { status: 'running' },
    });
  });

  it.each([
    [
      'a quote of another remix',
      'image',
      (remix: RemixClient) =>
        remix.startRemixGeneration({
          expectedRevision: 1,
          quoteId: 'scene-quote',
          runId: RUN_ID,
        }),
      'does not match',
    ],
    [
      'control of a remix without a scene pipeline',
      'image',
      (remix: RemixClient) =>
        remix.controlRemixGeneration({
          action: 'cancel',
          expectedRevision: 1,
          runId: RUN_ID,
        }),
      'scene pipeline',
    ],
    [
      'a scene operation on an image remix',
      'image',
      (remix: RemixClient) =>
        remix.quoteRemixGeneration({
          expectedRevision: 1,
          operation: 'analysis',
          runId: RUN_ID,
        }),
      'only support',
    ],
    [
      'a model on a scene quote',
      'video',
      (remix: RemixClient) =>
        remix.quoteRemixGeneration({
          expectedRevision: 1,
          model: 'arbitrary',
          operation: 'generate',
          runId: RUN_ID,
        }),
      'model is not accepted',
    ],
    [
      'a repair without its scene',
      'video',
      (remix: RemixClient) =>
        remix.quoteRemixGeneration({
          expectedRevision: 1,
          operation: 'repair',
          runId: RUN_ID,
        }),
      'Only repair accepts a scene and stage',
    ],
  ])('refuses %s before any write', async (_case, kind, call, message) => {
    await createRun(kind);

    await expect(call(client)).rejects.toThrow(message);
    expect(writes).toBe(1);
    expect(runOf()).not.toHaveProperty('executedQuoteId');
  });

  it('surfaces a stale revision as an upstream conflict', async () => {
    await createRun('image');

    await expect(
      client.updateRemixConcept({
        edits: { concept: { hook: 'late' } },
        expectedRevision: 7,
        runId: RUN_ID,
      }),
    ).rejects.toMatchObject({ message: 'Remix revision changed' });
    expect(runOf()?.concept).toEqual({});
  });

  it.each([400, 403, 404, 409])(
    'preserves upstream %i as an error, never a success result',
    async (status) => {
      isApiFailing = status;

      await expect(
        client.getRemixRun({ runId: 'foreign-run' }),
      ).rejects.toBeInstanceOf(McpUpstreamError);
    },
  );
});
