import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  getToken: vi.fn(),
  isApiKey: false,
  workspaceBrand: 'cbrand000000001' as string | null,
}));

vi.mock('~services/auth.service', () => ({
  authService: { getToken: mocks.getToken },
}));

import {
  ImportedSourceError,
  listImportedSources,
  observeSourceMedia,
  recaptureImportedSource,
  retrySourceMedia,
  saveImportedSource,
  startSourceMedia,
} from '../src/services/imported-source.service';

const root = path.dirname(fileURLToPath(import.meta.url));
const BRAND = 'cbrand000000001';
const SOURCE = 'csource00000001';

function jsonResponse(body: unknown, ok = true, status = ok ? 200 : 400) {
  return { json: async () => body, ok, status };
}

const snapshot = {
  authorHandle: 'author',
  canonicalUrl: 'https://x.com/author/status/1',
  capturedAt: '2026-10-12T00:00:00.000Z',
  capturedText: 'Original',
  captureSurface: 'extension',
  contentBasis: 'visible_page',
  evidenceAuthority: 'client_reported',
  host: 'x.com',
  kind: 'social',
  provenance: 'imported',
  title: 'Original',
};

function sourceResource(id = SOURCE, deduplicated = false) {
  return {
    id,
    type: 'imported-source',
    attributes: {
      brandId: BRAND,
      createdAt: '2026-10-12T00:00:00.000Z',
      deduplicated,
      identityDigest: 'b'.repeat(64),
      isDeleted: false,
      recordVersion: 1,
      snapshot,
      updatedAt: '2026-10-12T00:00:00.000Z',
    },
  };
}

function mediaResource(state: string, extra: Record<string, unknown> = {}) {
  return {
    id: 'cmedia000000001',
    type: 'imported-source-media',
    attributes: {
      bindingRevision: 1,
      canRetry: false,
      sourceId: SOURCE,
      sourceIdentityDigest: 'b'.repeat(64),
      sourceRecordVersion: 1,
      state,
      ...extra,
    },
  };
}

const input = {
  canonicalUrl: 'https://x.com/author/status/1',
  capturedText: 'Original',
  contentBasis: 'visible_page' as const,
  kind: 'social' as const,
  title: 'Original',
};

describe('Imported source service', () => {
  beforeEach(() => {
    mocks.workspaceBrand = BRAND;
    mocks.isApiKey = false;
    mocks.fetch.mockReset();
    mocks.getToken.mockReset().mockResolvedValue('token');
    vi.stubGlobal('fetch', mocks.fetch);
  });

  it('posts the snapshot to the brand-scoped canonical route', async () => {
    mocks.fetch.mockResolvedValueOnce(jsonResponse({ data: sourceResource() }));
    const saved = await saveImportedSource(BRAND, input);
    expect(saved).toMatchObject({ id: SOURCE, deduplicated: false });
    const [url, init] = mocks.fetch.mock.calls[0];
    expect(url).toBe(
      `https://api.genfeed.ai/v1/brands/${BRAND}/imported-sources`,
    );
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ snapshot: input });
    expect(new Headers(init.headers).get('x-genfeed-organization-id')).toBe(
      'org-1',
    );
  });

  it('reports a deduplicated source without writing again', async () => {
    mocks.fetch.mockResolvedValueOnce(
      jsonResponse({ data: sourceResource(SOURCE, true) }),
    );
    await expect(saveImportedSource(BRAND, input)).resolves.toMatchObject({
      deduplicated: true,
    });
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
  });

  it('pages through the list and validates every row', async () => {
    mocks.fetch
      .mockResolvedValueOnce(
        jsonResponse({
          data: [sourceResource('csource00000001')],
          links: { pagination: { pages: 2 } },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          data: [sourceResource('csource00000002')],
          links: { pagination: { pages: 2 } },
        }),
      );
    const sources = await listImportedSources(BRAND);
    expect(sources.map((item) => item.id)).toEqual([
      'csource00000001',
      'csource00000002',
    ]);
    expect(String(mocks.fetch.mock.calls[1][0])).toContain('page=2&limit=100');
  });

  it('refuses a row the contract cannot read instead of guessing', async () => {
    mocks.fetch.mockResolvedValueOnce(
      jsonResponse({ data: [{ ...sourceResource(), attributes: {} }] }),
    );
    await expect(listImportedSources(BRAND)).rejects.toThrow(
      /Update the extension/,
    );
  });

  it('keeps a deleted source deleted until the explicit recapture', async () => {
    mocks.fetch.mockResolvedValueOnce(
      jsonResponse(
        {
          code: 'IMPORTED_SOURCE_DELETED',
          deletedIngredientId: 'cdeleted0000001',
          message: 'Source was deleted. Use its explicit recapture route.',
        },
        false,
        409,
      ),
    );
    const failure = await saveImportedSource(BRAND, input).catch(
      (error: unknown) => error,
    );
    expect(failure).toBeInstanceOf(ImportedSourceError);
    expect(failure).toMatchObject({
      code: 'IMPORTED_SOURCE_DELETED',
      deletedSourceId: 'cdeleted0000001',
    });
    expect(mocks.fetch).toHaveBeenCalledTimes(1);

    mocks.fetch.mockResolvedValueOnce(jsonResponse({ data: sourceResource() }));
    await recaptureImportedSource(BRAND, 'cdeleted0000001');
    const [url, init] = mocks.fetch.mock.calls[1];
    expect(url).toBe(
      `https://api.genfeed.ai/v1/brands/${BRAND}/imported-sources/cdeleted0000001/recaptures`,
    );
    expect(JSON.parse(init.body).requestId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('rejects API-key sessions and another brand before any request', async () => {
    mocks.isApiKey = true;
    await expect(saveImportedSource(BRAND, input)).rejects.toMatchObject({
      code: 'IMPORTED_SOURCE_SESSION_REQUIRED',
    });
    mocks.isApiKey = false;
    await expect(saveImportedSource('cother0000000001', input)).rejects.toThrow(
      /original brand/,
    );
    await expect(saveImportedSource('  ', input)).rejects.toThrow(
      /Select a brand/,
    );
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it('turns an expired session into a sign-in message', async () => {
    mocks.fetch.mockResolvedValueOnce(jsonResponse({}, false, 401));
    await expect(saveImportedSource(BRAND, input)).rejects.toThrow(
      /Sign in again/,
    );
  });

  it('starts, observes and retries media only through explicit calls', async () => {
    mocks.fetch
      .mockResolvedValueOnce(
        jsonResponse({
          data: mediaResource('processing', { ingestRevision: 1 }),
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          data: mediaResource('processing', { ingestRevision: 1 }),
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          data: mediaResource('failed', {
            canRetry: true,
            errorCode: 'SOURCE_MEDIA_FAILED',
            ingestRevision: 1,
          }),
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          data: mediaResource('processing', { ingestRevision: 2 }),
        }),
      );
    expect((await startSourceMedia(BRAND, SOURCE)).state).toBe('processing');
    expect((await observeSourceMedia(BRAND, SOURCE)).state).toBe('processing');
    const failed = await observeSourceMedia(BRAND, SOURCE);
    expect(failed).toMatchObject({
      canRetry: true,
      errorCode: 'SOURCE_MEDIA_FAILED',
    });
    await retrySourceMedia(BRAND, SOURCE, failed.ingestRevision ?? 0);

    const calls = mocks.fetch.mock.calls.map(([url, init]) => [
      init.method,
      String(url).replace('https://api.genfeed.ai/v1', ''),
    ]);
    expect(calls).toEqual([
      ['POST', `/brands/${BRAND}/imported-sources/${SOURCE}/media`],
      ['GET', `/brands/${BRAND}/imported-sources/${SOURCE}/media`],
      ['GET', `/brands/${BRAND}/imported-sources/${SOURCE}/media`],
      ['POST', `/brands/${BRAND}/imported-sources/${SOURCE}/media/retry`],
    ]);
    expect(JSON.parse(mocks.fetch.mock.calls[3][1].body)).toMatchObject({
      expectedIngestRevision: 1,
    });
  });

  it('uses only the canonical routes and never the legacy or generation endpoints', () => {
    const source = readFileSync(
      path.resolve(root, '../src/services/imported-source.service.ts'),
      'utf8',
    );
    for (const legacy of [
      'social-sources',
      'source-posts',
      'knowledge-sources',
      '/videos',
      '/images',
      'AgentTools',
    ]) {
      expect(source).not.toContain(legacy);
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
    isApiKey: mocks.isApiKey,
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
