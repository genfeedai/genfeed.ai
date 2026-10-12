import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  REMIX_BRAND,
  REMIX_RUN,
  REMIX_SOURCE,
  remixDocument,
  remixExecution,
  remixQuote,
  remixView,
} from './fixtures/source-remix';

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  getToken: vi.fn(),
  store: new Map<string, unknown>(),
  workspaceBrand: 'cbrand000000001' as string | null,
}));

vi.mock('@plasmohq/storage', () => ({
  Storage: class {
    get = async (key: string) => mocks.store.get(key);
    set = async (key: string, value: unknown) => {
      mocks.store.set(key, value);
    };
  },
}));
vi.mock('~services/auth.service', () => ({
  authService: { getToken: mocks.getToken },
}));

import {
  createSourceRemix,
  executeSourceRemix,
  getSourceRemix,
  listSourceRemixImageModels,
  openSourceRemix,
  quoteSourceRemix,
  resolveSourceRemixStudioUrl,
  reviseSourceRemix,
  SourceRemixError,
} from '../src/services/source-remix.service';

const root = path.dirname(fileURLToPath(import.meta.url));

function ok(body: unknown) {
  return { json: async () => body, ok: true, status: 200 };
}

function fail(status: number, body: unknown = {}) {
  return { json: async () => body, ok: false, status };
}

function calls() {
  return mocks.fetch.mock.calls.map(([url, init]) => [
    init.method,
    String(url).replace('https://api.genfeed.ai/v1', ''),
  ]);
}

describe('Source remix service', () => {
  beforeEach(() => {
    mocks.workspaceBrand = REMIX_BRAND;
    mocks.store.clear();
    mocks.fetch.mockReset();
    mocks.getToken.mockReset().mockResolvedValue('token');
    vi.stubGlobal('fetch', mocks.fetch);
  });

  it('creates a draft for the canonical imported-source selector and starts nothing', async () => {
    mocks.fetch.mockResolvedValueOnce(ok(remixDocument(remixView())));
    const run = await createSourceRemix(REMIX_BRAND, REMIX_SOURCE);
    expect(run).toMatchObject({ id: REMIX_RUN, phase: 'prefilled' });
    expect(calls()).toEqual([
      ['POST', `/brands/${REMIX_BRAND}/content-runs/remixes`],
    ]);
    expect(JSON.parse(mocks.fetch.mock.calls[0][1].body)).toEqual({
      source: { importedSourceId: REMIX_SOURCE, kind: 'imported_source' },
    });
  });

  it('reopens the remembered remix for the same source instead of creating another', async () => {
    mocks.fetch
      .mockResolvedValueOnce(ok(remixDocument(remixView())))
      .mockResolvedValueOnce(
        ok(remixDocument(remixView({ phase: 'ready_for_review' }))),
      );
    await createSourceRemix(REMIX_BRAND, REMIX_SOURCE);
    const reopened = await openSourceRemix(REMIX_BRAND, REMIX_SOURCE);
    expect(reopened.phase).toBe('ready_for_review');
    expect(calls()).toEqual([
      ['POST', `/brands/${REMIX_BRAND}/content-runs/remixes`],
      ['GET', `/content-runs/${REMIX_RUN}/remix`],
    ]);
  });

  it('creates a fresh draft when the remembered remix belongs to another source or is gone', async () => {
    mocks.fetch
      .mockResolvedValueOnce(ok(remixDocument(remixView())))
      .mockResolvedValueOnce(fail(404, { message: 'Not found' }))
      .mockResolvedValueOnce(
        ok(remixDocument(remixView({ id: 'crun000000000002' }))),
      );
    await createSourceRemix(REMIX_BRAND, REMIX_SOURCE);
    const reopened = await openSourceRemix(REMIX_BRAND, REMIX_SOURCE);
    expect(reopened.id).toBe('crun000000000002');
    expect(calls()[2]).toEqual([
      'POST',
      `/brands/${REMIX_BRAND}/content-runs/remixes`,
    ]);
  });

  it('prices and executes only through the quote and execute routes', async () => {
    mocks.fetch
      .mockResolvedValueOnce(
        ok(remixDocument(remixView({ generationQuote: remixQuote() }))),
      )
      .mockResolvedValueOnce(
        ok(
          remixDocument(
            remixView({
              execution: remixExecution(['queued', 'queued', 'queued']),
              generationQuote: remixQuote({
                acceptedAt: '2026-10-12T10:01:00.000Z',
              }),
              phase: 'generating',
              status: 'running',
            }),
          ),
        ),
      );
    const quoted = await quoteSourceRemix(REMIX_RUN, 1, 'model-a');
    expect(quoted.generationQuote?.id).toBe('quote-1');
    await executeSourceRemix(REMIX_RUN, 1, 'quote-1');
    expect(calls()).toEqual([
      ['POST', `/content-runs/${REMIX_RUN}/remix/generation/quote`],
      ['POST', `/content-runs/${REMIX_RUN}/remix/generation/execute`],
    ]);
    expect(JSON.parse(mocks.fetch.mock.calls[0][1].body)).toEqual({
      expectedRevision: 1,
      model: 'model-a',
    });
    expect(JSON.parse(mocks.fetch.mock.calls[1][1].body)).toEqual({
      expectedRevision: 1,
      quoteId: 'quote-1',
    });
  });

  it('revises settings only with a stale-revision fence', async () => {
    mocks.fetch.mockResolvedValueOnce(ok(remixDocument(remixView())));
    await reviseSourceRemix(REMIX_RUN, 4, { output: { kind: 'copy' } });
    expect(mocks.fetch.mock.calls[0][1].method).toBe('PATCH');
    expect(JSON.parse(mocks.fetch.mock.calls[0][1].body)).toEqual({
      edits: { output: { kind: 'copy' } },
      expectedRevision: 4,
    });
    await expect(reviseSourceRemix(REMIX_RUN, 1, {})).rejects.toThrow();
  });

  it('turns insufficient credits and conflicts into plain messages', async () => {
    mocks.fetch
      .mockResolvedValueOnce(fail(402, { title: 'Insufficient credits' }))
      .mockResolvedValueOnce(
        fail(409, {
          detail: 'The generation quote expired. Request a fresh quote.',
        }),
      );
    await expect(executeSourceRemix(REMIX_RUN, 1, 'quote-1')).rejects.toThrow(
      /not have enough credits/,
    );
    await expect(executeSourceRemix(REMIX_RUN, 1, 'quote-1')).rejects.toThrow(
      /quote expired/,
    );
  });

  it('rejects a remix from another brand and a mismatched workspace brand', async () => {
    mocks.fetch.mockResolvedValueOnce(
      ok(remixDocument(remixView({ brandId: 'cother0000000001' }))),
    );
    await expect(getSourceRemix(REMIX_RUN)).rejects.toThrow(/another brand/);
    await expect(
      createSourceRemix('cother0000000001', REMIX_SOURCE),
    ).rejects.toThrow(/original brand/);
    mocks.workspaceBrand = null;
    await expect(getSourceRemix(REMIX_RUN)).rejects.toThrow(/Select a brand/);
  });

  it('refuses a document it cannot read instead of guessing', async () => {
    mocks.fetch.mockResolvedValueOnce(
      ok(remixDocument(remixView({ phase: 'mystery' }))),
    );
    await expect(getSourceRemix(REMIX_RUN)).rejects.toBeInstanceOf(
      SourceRemixError,
    );
  });

  it('lists only active, non-crun image models for the organization', async () => {
    mocks.fetch.mockResolvedValueOnce(
      ok({
        data: [
          {
            attributes: {
              isActive: true,
              key: 'img-a',
              label: 'Image A',
              provider: 'x',
            },
            id: 'm1',
            type: 'model',
          },
          {
            attributes: { isActive: true, key: 'crun/img', label: 'Crun' },
            id: 'm2',
            type: 'model',
          },
          {
            attributes: { isActive: false, key: 'img-b', label: 'Image B' },
            id: 'm3',
            type: 'model',
          },
        ],
      }),
    );
    expect(await listSourceRemixImageModels()).toEqual([
      { key: 'img-a', label: 'Image A', provider: 'x' },
    ]);
    expect(String(mocks.fetch.mock.calls[0][0])).toContain(
      'models?category=image&organizationId=org-1',
    );
  });

  it('builds the Studio run link from the brand and active organization slugs', async () => {
    mocks.fetch
      .mockResolvedValueOnce(
        ok({
          data: {
            attributes: { slug: 'moonrise' },
            id: REMIX_BRAND,
            type: 'brand',
          },
        }),
      )
      .mockResolvedValueOnce(
        ok([{ id: 'org-1', isActive: true, label: 'Acme', slug: 'acme' }]),
      );
    expect(await resolveSourceRemixStudioUrl(REMIX_RUN)).toBe(
      `https://app.genfeed.ai/acme/moonrise/studio/storyboard/${REMIX_RUN}`,
    );
  });

  it('never calls a provider or generation route directly', () => {
    const source = readFileSync(
      path.resolve(root, '../src/services/source-remix.service.ts'),
      'utf8',
    );
    for (const route of [
      '/images',
      '/videos',
      '/ingredients',
      'agent-tools',
      '/remix/start',
      'AgentTools',
    ]) {
      expect(source).not.toContain(route);
    }
  });
});

// Unit boundary: identity/bootstrap reconciliation is covered by workspace.service.test.ts.
vi.mock('~services/workspace.service', async () => {
  const { authService } = await import('~services/auth.service');
  const { apiEndpoint } = await import('~services/environment.service');
  const snapshotOf = async () => ({
    userId: 'user-1',
    organizationId: 'org-1',
    brandId: mocks.workspaceBrand,
    brands: [{ id: mocks.workspaceBrand }],
    isApiKey: false,
    revision: 1,
  });
  return {
    requireWorkspace: snapshotOf,
    assertWorkspace: vi.fn(),
    scopedWorkspaceRequest: async (
      requestPath: string,
      options: RequestInit,
      expected: { organizationId: string },
    ) => {
      const token = await authService.getToken();
      const headers = new Headers(options.headers);
      headers.set('Authorization', `Bearer ${token}`);
      headers.set('x-genfeed-organization-id', expected.organizationId);
      return fetch(
        requestPath.startsWith('http')
          ? requestPath
          : `${apiEndpoint}${requestPath}`,
        { ...options, headers },
      );
    },
  };
});
