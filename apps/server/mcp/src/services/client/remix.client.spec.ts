import { BaseApiClient } from '@mcp/services/client/base-api-client';
import { RemixClient } from '@mcp/services/client/remix.client';
import { McpUpstreamError } from '@mcp/tools/mcp-tool-error';

function setup(kind = 'image') {
  const view = {
    id: 'run-1',
    revision: 2,
    draft: { output: { kind } },
    generationQuote: { id: 'quote-1' },
    scenePipeline: { quote: { id: 'scene-quote' } },
  };
  const response = () => ({
    data: { data: { id: 'run-1', attributes: { ...view, id: undefined } } },
  });
  const http = {
    get: vi.fn().mockImplementation(async () => response()),
    post: vi.fn().mockImplementation(async () => response()),
    patch: vi.fn().mockImplementation(async () => response()),
    defaults: { headers: {} },
  };
  const base = new BaseApiClient(
    { debug: vi.fn(), error: vi.fn() } as never,
    { axiosRef: { create: () => http } } as never,
    { get: () => undefined } as never,
  );
  return { client: new RemixClient(base), http, view };
}

describe('RemixClient canonical routes', () => {
  it('imports with explicit encoded brand and preserves nested source identities', async () => {
    const { client, http } = setup();
    const imported = {
      deduplicated: true,
      post: { id: 'source-post-1' },
      source: { id: 'source-1' },
    };
    http.post.mockResolvedValueOnce({ data: imported });
    expect(
      await client.importSourcePost({
        brandId: 'brand:1',
        url: 'https://x.com/example/status/1',
      }),
    ).toEqual(imported);
    expect(http.post).toHaveBeenCalledWith(
      '/social-sources/import-post?brandId=brand%3A1',
      { url: 'https://x.com/example/status/1' },
    );
    expect(http.get).not.toHaveBeenCalled();
  });

  it('creates/reuses, reads, revises and attaches through canonical routes without dispatch', async () => {
    const { client, http } = setup();
    expect(
      await client.createRemixConcept({
        brandId: 'brand:1',
        sourcePostId: 'source-1',
      }),
    ).toMatchObject({ id: 'run-1', revision: 2 });
    expect(http.post).toHaveBeenCalledWith(
      '/brands/brand%3A1/content-runs/remixes',
      { source: { kind: 'source_post', sourcePostId: 'source-1' } },
    );
    await client.getRemixRun({ runId: 'run:1' });
    expect(http.get).toHaveBeenCalledWith('/content-runs/run%3A1/remix');
    await client.updateRemixConcept({
      runId: 'run-1',
      expectedRevision: 2,
      edits: { concept: { hook: null } },
    });
    expect(http.patch).toHaveBeenCalledWith('/content-runs/run-1/remix', {
      expectedRevision: 2,
      edits: { concept: { hook: null } },
    });
    await client.attachRemixAnalysisSource({
      runId: 'run-1',
      expectedRevision: 2,
      assetId: null,
    });
    expect(http.patch).toHaveBeenCalledWith(
      '/content-runs/run-1/remix/scenes/source',
      { expectedRevision: 2, assetId: null },
    );
    expect(http.post).toHaveBeenCalledTimes(1);
  });

  it.each(['image', 'copy'])(
    'quotes and executes %s with the generic family',
    async (kind) => {
      const { client, http } = setup(kind);
      await client.quoteRemixGeneration({
        runId: 'run-1',
        expectedRevision: 2,
        operation: 'generate',
        ...(kind === 'image' ? { model: 'model-1' } : {}),
      });
      expect(http.post).toHaveBeenLastCalledWith(
        '/content-runs/run-1/remix/generation/quote',
        {
          expectedRevision: 2,
          ...(kind === 'image' ? { model: 'model-1' } : {}),
        },
      );
      await client.startRemixGeneration({
        runId: 'run-1',
        expectedRevision: 2,
        quoteId: 'quote-1',
      });
      expect(http.post).toHaveBeenLastCalledWith(
        '/content-runs/run-1/remix/generation/execute',
        { expectedRevision: 2, quoteId: 'quote-1' },
      );
      expect(http.get).toHaveBeenCalledTimes(2);
    },
  );

  it.each(['video', 'avatar'])(
    'routes %s analysis before storyboard, generation, repair, execution and control to scenes',
    async (kind) => {
      const { client, http } = setup(kind);
      for (const operation of ['analysis', 'generate', 'repair'] as const) {
        const payload = {
          expectedRevision: 2,
          operation,
          ...(operation === 'repair'
            ? { sceneId: 'scene-1', repairStage: 'image' as const }
            : {}),
        };
        await client.quoteRemixGeneration({ runId: 'run-1', ...payload });
        expect(http.post).toHaveBeenLastCalledWith(
          '/content-runs/run-1/remix/scenes/quote',
          payload,
        );
      }
      await client.startRemixGeneration({
        runId: 'run-1',
        expectedRevision: 2,
        quoteId: 'scene-quote',
      });
      expect(http.post).toHaveBeenLastCalledWith(
        '/content-runs/run-1/remix/scenes/execute',
        { expectedRevision: 2, quoteId: 'scene-quote' },
      );
      for (const action of ['cancel', 'resume'] as const) {
        await client.controlRemixGeneration({
          runId: 'run-1',
          expectedRevision: 2,
          action,
        });
        expect(http.post).toHaveBeenLastCalledWith(
          `/content-runs/run-1/remix/scenes/${action}`,
          { expectedRevision: 2 },
        );
      }
    },
  );

  it('fails mismatched quote and unsupported lifecycle/quote fields before writes', async () => {
    const { client, http } = setup();
    await expect(
      client.startRemixGeneration({
        runId: 'run-1',
        expectedRevision: 2,
        quoteId: 'scene-quote',
      }),
    ).rejects.toThrow('does not match');
    await expect(
      client.controlRemixGeneration({
        runId: 'run-1',
        expectedRevision: 2,
        action: 'cancel',
      }),
    ).rejects.toThrow('scene pipeline');
    await expect(
      client.quoteRemixGeneration({
        runId: 'run-1',
        expectedRevision: 2,
        operation: 'analysis',
      }),
    ).rejects.toThrow('only support');
    expect(http.post).not.toHaveBeenCalled();
    const scene = setup('video');
    await expect(
      scene.client.quoteRemixGeneration({
        runId: 'run-1',
        expectedRevision: 2,
        operation: 'generate',
        model: 'arbitrary',
      }),
    ).rejects.toThrow('model is not accepted');
    await expect(
      scene.client.quoteRemixGeneration({
        runId: 'run-1',
        expectedRevision: 2,
        operation: 'repair',
      }),
    ).rejects.toThrow();
    expect(scene.http.post).not.toHaveBeenCalled();
  });

  it.each([400, 403, 404, 409])(
    'preserves upstream %i as an error, never a success result',
    async (status) => {
      const { client, http } = setup();
      http.get.mockRejectedValue({
        response: {
          status,
          data: { errors: [{ detail: 'Canonical failure' }] },
        },
      });
      await expect(
        client.getRemixRun({ runId: 'foreign-run' }),
      ).rejects.toBeInstanceOf(McpUpstreamError);
      expect(http.post).not.toHaveBeenCalled();
    },
  );
});
