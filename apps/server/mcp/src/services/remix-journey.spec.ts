import type { LoggerService } from '@libs/logger/logger.service';
import { ClientService } from '@mcp/services/client.service';
import { ToolRegistryService } from '@mcp/services/tool-registry.service';

/**
 * #5132 end-to-end fixture journey: the real curated catalog, mutation
 * policy, registry, ClientService and RemixClient drive an in-memory canonical
 * API. Only the role guard is mocked; approvals persist in the fixture API.
 */
vi.mock('@mcp/guards/mcp-auth.guard', () => ({
  McpAuthGuard: { checkToolRole: vi.fn() },
}));

type Recorded = { method: string; path: string; body?: unknown };
type View = Record<string, unknown> & {
  id: string;
  brandId: string;
  revision: number;
  phase: string;
  draft: { output: { kind: string; count?: number } };
};
type Approval = {
  id: string;
  status: 'PENDING' | 'APPROVED' | 'DECLINED';
  toolName: string;
  arguments: Record<string, unknown>;
};

class FixtureApiError extends Error {
  constructor(
    readonly status: number,
    detail: string,
  ) {
    super(detail);
  }
  get response() {
    return {
      status: this.status,
      data: { errors: [{ detail: this.message }] },
    };
  }
}

const ALLOWED_PATHS = [
  /^\/social-sources\/import-post\?brandId=[^/]+$/,
  /^\/brands\/[^/]+\/content-runs\/remixes$/,
  /^\/content-runs\/[^/]+\/remix$/,
  /^\/content-runs\/[^/]+\/remix\/generation\/(quote|execute)$/,
  /^\/content-runs\/[^/]+\/remix\/scenes\/(source|quote|execute|cancel|resume)$/,
  /^\/mcp-approvals(\/[^/]+\/(resolve|result))?$/,
];
const FORBIDDEN_FRAGMENTS = [
  'knowledge',
  'publish',
  '/posts',
  '/images',
  '/videos',
  '/generate',
  '/remix/start',
];

function fixtureApi() {
  const requests: Recorded[] = [];
  const approvals = new Map<string, Approval>();
  const runs = new Map<string, View>();
  const executions: string[] = [];
  let importedPost: string | undefined;
  let quoteCounter = 0;
  const quoteState = { isExpired: false };

  const view = (run: View) => ({
    data: { data: { id: run.id, attributes: { ...run, id: undefined } } },
  });
  const envelope = (data: unknown) => ({ data: { data } });
  const blank = (id: string, kind: string): View => ({
    id,
    brandId: 'brand-1',
    revision: 1,
    phase: 'prefilled',
    draft: { output: { kind, count: 1 } },
    sourceSnapshot: {
      selector: { kind: 'source_post', sourcePostId: 'source-post-1' },
      sourceUrl: 'https://x.com/creator/status/1',
    },
  });
  const requireRun = (id: string) => {
    const run = runs.get(decodeURIComponent(id));
    if (!run) throw new FixtureApiError(404, 'Remix run was not found.');
    return run;
  };
  const requireRevision = (run: View, body: Record<string, unknown>) => {
    if (body.expectedRevision !== run.revision)
      throw new FixtureApiError(
        409,
        `Expected remix revision ${body.expectedRevision}, but the current revision is ${run.revision}.`,
      );
  };
  const nextQuote = (run: View, extra: Record<string, unknown> = {}) => {
    quoteCounter += 1;
    return {
      id: `quote-${quoteCounter}`,
      revision: run.revision,
      expiresAt: '2026-10-03T12:15:00.000Z',
      ...extra,
    };
  };
  const accept = (run: View, quote: Record<string, unknown>) => {
    quote.acceptedAt = '2026-10-03T12:01:00.000Z';
    run.phase = 'generating';
    run.execution = {
      variants: [
        { id: 'variant-1', status: 'completed', assetIds: ['asset-out-1'] },
      ],
    };
    executions.push(run.id);
  };

  const routes: [
    string,
    RegExp,
    (match: RegExpMatchArray, body: Record<string, unknown>) => unknown,
  ][] = [
    [
      'post',
      /^\/social-sources\/import-post\?brandId=(.+)$/,
      ([, brandId], body) => {
        if (brandId !== 'brand-1')
          throw new FixtureApiError(
            404,
            'Brand was not found in this organization.',
          );
        const url = String(body.url);
        if (
          !/^https:\/\/(x\.com|www\.instagram\.com|www\.tiktok\.com)\//.test(
            url,
          )
        )
          throw new FixtureApiError(
            400,
            'URL is not a recognizable X, Instagram, or TikTok post link',
          );
        if (url.includes('/private/'))
          throw new FixtureApiError(
            404,
            'Post could not be resolved — it may be deleted, private, or the link is wrong',
          );
        const deduplicated = importedPost === url;
        importedPost = url;
        return {
          data: {
            deduplicated,
            post: { id: 'source-post-1', sourceUrl: url },
            source: { id: 'source-1' },
          },
        };
      },
    ],
    [
      'post',
      /^\/brands\/([^/]+)\/content-runs\/remixes$/,
      ([, brandId], body) => {
        if (brandId !== 'brand-1')
          throw new FixtureApiError(
            404,
            'Brand was not found in this organization.',
          );
        const source = body.source as Record<string, unknown>;
        if (source.sourcePostId !== 'source-post-1')
          throw new FixtureApiError(404, 'Imported source post was not found.');
        if (!runs.has('run-image'))
          runs.set('run-image', blank('run-image', 'image'));
        return view(requireRun('run-image'));
      },
    ],
    [
      'get',
      /^\/content-runs\/([^/]+)\/remix$/,
      ([, id]) => view(requireRun(id)),
    ],
    [
      'patch',
      /^\/content-runs\/([^/]+)\/remix$/,
      ([, id], body) => {
        const run = requireRun(id);
        requireRevision(run, body);
        run.edits = body.edits;
        run.revision += 1;
        delete run.generationQuote;
        return view(run);
      },
    ],
    [
      'patch',
      /^\/content-runs\/([^/]+)\/remix\/scenes\/source$/,
      ([, id], body) => {
        const run = requireRun(id);
        requireRevision(run, body);
        if (body.assetId === 'asset-other-brand')
          throw new FixtureApiError(
            404,
            'Library video was not found for this brand.',
          );
        run.analysisSource =
          body.assetId === null ? undefined : { assetId: body.assetId };
        run.revision += 1;
        return view(run);
      },
    ],
    [
      'post',
      /^\/content-runs\/([^/]+)\/remix\/generation\/quote$/,
      ([, id], body) => {
        const run = requireRun(id);
        requireRevision(run, body);
        run.generationQuote = nextQuote(run, { model: body.model, count: 1 });
        return view(run);
      },
    ],
    [
      'post',
      /^\/content-runs\/([^/]+)\/remix\/generation\/execute$/,
      ([, id], body) => {
        const run = requireRun(id);
        requireRevision(run, body);
        const quote = run.generationQuote as
          | Record<string, unknown>
          | undefined;
        if (!quote || quote.id !== body.quoteId)
          throw new FixtureApiError(
            409,
            'The generation quote does not match this remix revision.',
          );
        if (quote.acceptedAt) return view(run);
        if (quoteState.isExpired)
          throw new FixtureApiError(
            409,
            'The generation quote expired. Request a fresh quote.',
          );
        accept(run, quote);
        return view(run);
      },
    ],
    [
      'post',
      /^\/content-runs\/([^/]+)\/remix\/scenes\/quote$/,
      ([, id], body) => {
        const run = requireRun(id);
        requireRevision(run, body);
        run.scenePipeline = {
          quote: nextQuote(run, { operation: body.operation }),
        };
        return view(run);
      },
    ],
    [
      'post',
      /^\/content-runs\/([^/]+)\/remix\/scenes\/execute$/,
      ([, id], body) => {
        const run = requireRun(id);
        requireRevision(run, body);
        const quote = (
          run.scenePipeline as Record<string, Record<string, unknown>>
        ).quote;
        if (quote.id !== body.quoteId)
          throw new FixtureApiError(409, 'The scene quote does not match.');
        if (!quote.acceptedAt) accept(run, quote);
        return view(run);
      },
    ],
    [
      'post',
      /^\/content-runs\/([^/]+)\/remix\/scenes\/(cancel|resume)$/,
      ([, id, action], body) => {
        const run = requireRun(id);
        requireRevision(run, body);
        run.phase = action === 'cancel' ? 'cancelled' : 'generating';
        return view(run);
      },
    ],
    [
      'post',
      /^\/mcp-approvals$/,
      (_match, body) => {
        const approval: Approval = {
          id: `apr-${approvals.size + 1}`,
          status: 'PENDING',
          toolName: String(body.toolName),
          arguments: body.arguments as Record<string, unknown>,
        };
        approvals.set(approval.id, approval);
        return envelope(approval);
      },
    ],
    [
      'post',
      /^\/mcp-approvals\/([^/]+)\/resolve$/,
      ([, id], body) => {
        const approval = approvals.get(id);
        if (approval?.status !== 'PENDING')
          throw new FixtureApiError(409, 'Approval already resolved');
        approval.status = body.decision === 'approve' ? 'APPROVED' : 'DECLINED';
        return envelope(approval);
      },
    ],
    [
      'post',
      /^\/mcp-approvals\/([^/]+)\/result$/,
      ([, id]) => envelope(approvals.get(id)),
    ],
  ];

  const handle =
    (method: string) =>
    async (path: string, body?: Record<string, unknown>) => {
      requests.push({ method, path, body });
      for (const [routeMethod, pattern, handler] of routes) {
        const match = routeMethod === method ? path.match(pattern) : null;
        if (match) return handler(match, body ?? {});
      }
      throw new FixtureApiError(404, `No fixture route for ${method} ${path}`);
    };
  const http = {
    get: vi.fn(handle('get')),
    post: vi.fn(handle('post')),
    patch: vi.fn(handle('patch')),
    defaults: { headers: {} },
  };
  return { approvals, executions, http, quoteState, requests, runs, blank };
}

function build() {
  const api = fixtureApi();
  const logger = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  } as unknown as LoggerService;
  const client = new ClientService(
    logger,
    { axiosRef: { create: () => api.http } } as never,
    { get: () => undefined } as never,
  );
  const registry = new ToolRegistryService(client, logger, 'admin');
  type Result = {
    isError?: boolean;
    content: { text: string }[];
  };
  const call = async (name: string, args: Record<string, unknown>) =>
    (await registry.handleToolCall({ name, arguments: args })) as Result;
  const json = (result: Result) => {
    expect(result.isError).toBeFalsy();
    return JSON.parse(result.content[0].text) as Record<string, unknown>;
  };
  const latestApproval = () =>
    [...api.approvals.values()].slice(-1)[0] as Approval;
  const approve = async (name: string, args: Record<string, unknown>) => {
    const pending = await call(name, args);
    expect(pending.isError).toBe(true);
    expect(pending.content[0].text).toContain('approval_pending');
    const approval = latestApproval();
    expect(approval).toMatchObject({
      status: 'PENDING',
      toolName: name,
      arguments: args,
    });
    return call('resolve_approval', {
      approvalId: approval.id,
      decision: 'approve',
    });
  };
  const paths = () => api.requests.map((request) => request.path);
  return { api, approve, call, json, latestApproval, paths };
}

function assertCanonicalTraffic(paths: string[]) {
  for (const path of paths) {
    expect(
      ALLOWED_PATHS.some((pattern) => pattern.test(path)),
      path,
    ).toBe(true);
    for (const fragment of FORBIDDEN_FRAGMENTS)
      expect(path.includes(fragment), `${path} contains ${fragment}`).toBe(
        false,
      );
  }
}

describe('external remix journey (#5132)', () => {
  it('imports, saves, edits, quotes, approves, executes once and reconnects', async () => {
    const { api, approve, call, json, paths } = build();
    const url = 'https://x.com/creator/status/1';

    const imported = json(
      await approve('import_source_post', { brandId: 'brand-1', url }),
    );
    expect(imported).toMatchObject({
      deduplicated: false,
      post: { id: 'source-post-1' },
      source: { id: 'source-1' },
    });
    const again = json(
      await approve('import_source_post', { brandId: 'brand-1', url }),
    );
    expect(again).toMatchObject({
      deduplicated: true,
      post: { id: 'source-post-1' },
    });

    const created = json(
      await call('create_remix_concept', {
        brandId: 'brand-1',
        sourcePostId: 'source-post-1',
      }),
    );
    const reused = json(
      await call('create_remix_concept', {
        brandId: 'brand-1',
        sourcePostId: 'source-post-1',
      }),
    );
    expect(created).toMatchObject({
      id: 'run-image',
      revision: 1,
      brandId: 'brand-1',
    });
    expect(reused).toMatchObject({ id: 'run-image', revision: 1 });
    expect(created.sourceSnapshot).toMatchObject({
      selector: { kind: 'source_post', sourcePostId: 'source-post-1' },
    });

    const edited = json(
      await call('update_remix_concept', {
        runId: 'run-image',
        expectedRevision: 1,
        edits: { intent: { objective: 'A brand-owned original story' } },
      }),
    );
    expect(edited.revision).toBe(2);

    const quoted = json(
      await call('quote_remix_generation', {
        runId: 'run-image',
        expectedRevision: 2,
        operation: 'generate',
        model: 'image-model',
      }),
    );
    const quote = quoted.generationQuote as Record<string, unknown>;
    expect(quote).toMatchObject({
      id: 'quote-1',
      revision: 2,
      model: 'image-model',
    });
    expect(quote.acceptedAt).toBeUndefined();
    expect(api.executions).toEqual([]);

    const inspected = json(await call('get_remix_run', { runId: 'run-image' }));
    expect(inspected.generationQuote).toMatchObject({ id: 'quote-1' });

    const startArgs = {
      runId: 'run-image',
      expectedRevision: 2,
      quoteId: 'quote-1',
    };
    const started = json(await approve('start_remix_generation', startArgs));
    expect(started).toMatchObject({
      id: 'run-image',
      revision: 2,
      phase: 'generating',
    });
    expect(api.executions).toEqual(['run-image']);

    const reconnect = json(await call('get_remix_run', { runId: 'run-image' }));
    const replay = json(await approve('start_remix_generation', startArgs));
    for (const view of [reconnect, replay]) {
      expect(view).toMatchObject({
        id: 'run-image',
        revision: 2,
        execution: { variants: [{ assetIds: ['asset-out-1'] }] },
      });
    }
    expect(api.executions).toEqual(['run-image']);

    const executeIndex = paths().findIndex((path) =>
      path.endsWith('/generation/execute'),
    );
    const resolveIndex = api.requests.findIndex(
      (request) =>
        request.path.endsWith('/resolve') &&
        api.approvals.get(request.path.split('/')[2])?.toolName ===
          'start_remix_generation',
    );
    expect(resolveIndex).toBeGreaterThan(-1);
    expect(executeIndex).toBeGreaterThan(resolveIndex);
    assertCanonicalTraffic(paths());
  });

  it('routes video remixes through scene attach, quote, execute, cancel and resume without a model', async () => {
    const { api, approve, call, json, paths } = build();
    api.runs.set('run-video', api.blank('run-video', 'video'));

    expect(
      json(
        await call('attach_remix_analysis_source', {
          runId: 'run-video',
          expectedRevision: 1,
          assetId: 'library-video-1',
        }),
      ),
    ).toMatchObject({
      revision: 2,
      analysisSource: { assetId: 'library-video-1' },
    });
    const cleared = json(
      await call('attach_remix_analysis_source', {
        runId: 'run-video',
        expectedRevision: 2,
        assetId: null,
      }),
    );
    expect(cleared).toMatchObject({ revision: 3 });
    expect(cleared.analysisSource).toBeUndefined();
    expect(cleared.sourceSnapshot).toMatchObject({
      sourceUrl: 'https://x.com/creator/status/1',
    });

    const quoted = json(
      await call('quote_remix_generation', {
        runId: 'run-video',
        expectedRevision: 3,
        operation: 'analysis',
      }),
    );
    expect(quoted.scenePipeline).toMatchObject({ quote: { id: 'quote-1' } });
    const sceneQuoteBody = api.requests.find((request) =>
      request.path.endsWith('/scenes/quote'),
    )?.body;
    expect(sceneQuoteBody).toEqual({
      expectedRevision: 3,
      operation: 'analysis',
    });

    json(
      await approve('start_remix_generation', {
        runId: 'run-video',
        expectedRevision: 3,
        quoteId: 'quote-1',
      }),
    );
    expect(api.executions).toEqual(['run-video']);
    expect(
      json(
        await approve('control_remix_generation', {
          runId: 'run-video',
          expectedRevision: 3,
          action: 'cancel',
        }),
      ),
    ).toMatchObject({ phase: 'cancelled' });
    expect(
      json(
        await approve('control_remix_generation', {
          runId: 'run-video',
          expectedRevision: 3,
          action: 'resume',
        }),
      ),
    ).toMatchObject({ phase: 'generating' });
    expect(paths().some((path) => path.includes('/generation/'))).toBe(false);
    assertCanonicalTraffic(paths());
  });

  it.each([
    ['unsupported host', 'https://example.com/post/1', 'not a recognizable'],
    ['private post', 'https://x.com/private/status/2', 'private'],
  ])(
    'fails closed for an %s import without creating or generating',
    async (_label, url, message) => {
      const { api, approve, paths } = build();
      const result = await approve('import_source_post', {
        brandId: 'brand-1',
        url,
      });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain(message);
      expect(api.runs.size).toBe(0);
      expect(api.executions).toEqual([]);
      expect(
        paths().filter((path) => !path.startsWith('/mcp-approvals')),
      ).toEqual(['/social-sources/import-post?brandId=brand-1']);
    },
  );

  it('rejects invalid import input before queueing an approval or calling the API', async () => {
    const { api, call } = build();
    const result = await call('import_source_post', {
      brandId: 'brand-1',
      url: 'ftp://x.com/1',
    });
    expect(result.isError).toBe(true);
    const approval = [...api.approvals.values()][0];
    if (approval) {
      const executed = await call('resolve_approval', {
        approvalId: approval.id,
        decision: 'approve',
      });
      expect(executed.isError).toBe(true);
    }
    expect(
      api.requests.some((request) =>
        request.path.startsWith('/social-sources'),
      ),
    ).toBe(false);
  });

  it('rejects cross-tenant brands and runs and stale revisions without overwriting', async () => {
    const { api, call } = build();
    api.runs.set('run-image', api.blank('run-image', 'image'));

    const foreignBrand = await call('create_remix_concept', {
      brandId: 'brand-other',
      sourcePostId: 'source-post-1',
    });
    expect(foreignBrand.isError).toBe(true);
    expect(foreignBrand.content[0].text).toContain('not found');

    const foreignRun = await call('get_remix_run', { runId: 'run-foreign' });
    expect(foreignRun.isError).toBe(true);

    const stale = await call('update_remix_concept', {
      runId: 'run-image',
      expectedRevision: 9,
      edits: { intent: { objective: 'Overwrite attempt' } },
    });
    expect(stale.isError).toBe(true);
    expect(stale.content[0].text).toContain('current revision is 1');
    expect(api.runs.get('run-image')).toMatchObject({ revision: 1 });
    expect(api.runs.get('run-image')?.edits).toBeUndefined();

    const staleQuote = await call('quote_remix_generation', {
      runId: 'run-image',
      expectedRevision: 9,
      operation: 'generate',
      model: 'image-model',
    });
    expect(staleQuote.isError).toBe(true);
    expect(api.runs.get('run-image')?.generationQuote).toBeUndefined();
  });

  it('fails closed on expired, changed or mismatched quotes and declined approvals', async () => {
    const { api, approve, call, json, latestApproval, paths } = build();
    api.runs.set('run-image', api.blank('run-image', 'image'));
    json(
      await call('quote_remix_generation', {
        runId: 'run-image',
        expectedRevision: 1,
        operation: 'generate',
        model: 'image-model',
      }),
    );

    const mismatch = await approve('start_remix_generation', {
      runId: 'run-image',
      expectedRevision: 1,
      quoteId: 'quote-old',
    });
    expect(mismatch.isError).toBe(true);
    expect(mismatch.content[0].text).toContain('Request a fresh quote');
    expect(paths().some((path) => path.endsWith('/generation/execute'))).toBe(
      false,
    );

    await call('start_remix_generation', {
      runId: 'run-image',
      expectedRevision: 1,
      quoteId: 'quote-1',
    });
    await call('resolve_approval', {
      approvalId: latestApproval().id,
      decision: 'decline',
    });
    expect(paths().some((path) => path.endsWith('/generation/execute'))).toBe(
      false,
    );

    api.quoteState.isExpired = true;
    const expired = await approve('start_remix_generation', {
      runId: 'run-image',
      expectedRevision: 1,
      quoteId: 'quote-1',
    });
    expect(expired.isError).toBe(true);
    expect(expired.content[0].text).toContain('expired');

    json(
      await call('update_remix_concept', {
        runId: 'run-image',
        expectedRevision: 1,
        edits: { intent: { objective: 'Changed after quoting' } },
      }),
    );
    const changed = await approve('start_remix_generation', {
      runId: 'run-image',
      expectedRevision: 2,
      quoteId: 'quote-1',
    });
    expect(changed.isError).toBe(true);
    expect(api.executions).toEqual([]);
  });

  it('rejects wrong-family quote fields and image lifecycle control before writing', async () => {
    const { api, approve, call } = build();
    api.runs.set('run-copy', api.blank('run-copy', 'copy'));

    const sceneFields = await call('quote_remix_generation', {
      runId: 'run-copy',
      expectedRevision: 1,
      operation: 'repair',
      sceneId: 'scene-1',
    });
    expect(sceneFields.isError).toBe(true);
    const control = await approve('control_remix_generation', {
      runId: 'run-copy',
      expectedRevision: 1,
      action: 'cancel',
    });
    expect(control.isError).toBe(true);
    expect(control.content[0].text).toContain('scene pipeline');
    expect(
      api.requests.filter(
        (request) =>
          request.method !== 'get' &&
          !request.path.startsWith('/mcp-approvals'),
      ),
    ).toEqual([]);
  });
});
