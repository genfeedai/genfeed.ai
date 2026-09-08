import { KnowledgeSourcePurpose } from '@genfeedai/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  store: new Map<string, unknown>(),
  getToken: vi.fn(),
  getAuthContext: vi.fn(),
  fetch: vi.fn(),
}));
vi.mock('@plasmohq/storage', () => ({
  Storage: class {
    get = async (key: string) => structuredClone(mocks.store.get(key));
    set = async (key: string, value: unknown) => {
      mocks.store.set(key, structuredClone(value));
    };
  },
}));
vi.mock('~services/auth.service', () => ({
  authService: {
    getToken: mocks.getToken,
    getAuthContext: mocks.getAuthContext,
  },
}));

import {
  discardKnowledgeCapture,
  enqueueKnowledgeCapture,
  importLegacyCaptures,
  listCaptureSpaces,
  listKnowledgeCaptures,
  retryKnowledgeCapture,
} from '../src/services/knowledge-capture.service';

const draft = {
  brandId: 'brand-a',
  mode: 'page' as const,
  title: 'Evidence',
  text: 'Visible text',
  url: 'https://example.com/article',
  purpose: KnowledgeSourcePurpose.RESEARCH,
};
const response = (data: unknown, extra = {}) => ({
  ok: true,
  json: async () => ({ data, ...extra }),
});

beforeEach(() => {
  mocks.store.clear();
  mocks.fetch.mockReset();
  vi.stubGlobal('fetch', mocks.fetch);
  mocks.getToken.mockResolvedValue('auth-token');
  mocks.getAuthContext.mockResolvedValue({
    user: { id: 'user-a' },
    organization: { id: 'org-a' },
  });
  mocks.fetch.mockResolvedValue(
    response({ id: 'source-a' }, { versionId: 'version-a' }),
  );
});

describe('canonical extension Knowledge capture', () => {
  it('saves a sanitized TEXT snapshot to the active brand Inbox with provenance', async () => {
    const result = await enqueueKnowledgeCapture({
      ...draft,
      url: 'https://example.com/article?token=secret',
      text: 'Evidence password=secret',
    });
    expect(result).toMatchObject({
      sourceId: 'source-a',
      state: 'queued',
      brandId: 'brand-a',
    });
    const [url, options] = mocks.fetch.mock.calls[0];
    expect(url).toMatch(/knowledge-sources\?brandId=brand-a$/);
    const body = JSON.parse(options.body);
    expect(body).toMatchObject({
      kind: 'TEXT',
      scope: 'brand',
      purpose: 'RESEARCH',
      provenance: {
        capturedBy: 'extension',
        mode: 'page',
        captureId: result.id,
      },
    });
    expect(options.body).not.toContain('secret');
    expect(options.body).not.toContain('auth-token');
    expect(options.headers['Idempotency-Key']).toBe(result.id);
    expect(result.draft).toBeUndefined();
  });

  it('never forwards or retains arbitrary capture metadata such as cookies', async () => {
    mocks.fetch.mockRejectedValueOnce(new TypeError('offline'));
    await enqueueKnowledgeCapture(
      Object.assign({}, draft, {
        cookies: 'session-secret',
        platformData: { token: 'platform-secret' },
      }),
    );
    expect(JSON.stringify([...mocks.store.values()])).not.toContain('secret');
    expect(mocks.fetch.mock.calls[0][1].body).not.toContain('secret');
  });

  it('requires an active brand instead of silently saving personal sources', async () => {
    await expect(
      enqueueKnowledgeCapture({ ...draft, brandId: '' }),
    ).rejects.toThrow('Select a brand');
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it('saves links as URL sources', async () => {
    await enqueueKnowledgeCapture({ ...draft, mode: 'link', text: '' });
    expect(JSON.parse(mocks.fetch.mock.calls[0][1].body)).toMatchObject({
      kind: 'URL',
      referenceUrl: draft.url,
    });
  });

  it('keeps a failed request for offline retry and reuses its idempotency key', async () => {
    mocks.fetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const failed = await enqueueKnowledgeCapture(draft);
    expect(failed).toMatchObject({
      state: 'failed',
      draft,
      error: expect.stringContaining('offline'),
    });
    const retried = await retryKnowledgeCapture(failed.id);
    expect(retried).toMatchObject({ id: failed.id, state: 'queued' });
    expect(mocks.fetch.mock.calls[0][1].headers['Idempotency-Key']).toBe(
      mocks.fetch.mock.calls[1][1].headers['Idempotency-Key'],
    );
  });

  it('reuses pending identical submissions but permits new intentional captures', async () => {
    mocks.fetch.mockRejectedValueOnce(new TypeError('offline'));
    const first = await enqueueKnowledgeCapture(draft);
    const recovered = await enqueueKnowledgeCapture(draft);
    expect(recovered.id).toBe(first.id);
    const intentional = await enqueueKnowledgeCapture(draft);
    expect(intentional.id).not.toBe(first.id);
  });

  it('retries space membership without creating another source', async () => {
    mocks.fetch
      .mockResolvedValueOnce(
        response({ id: 'source-a' }, { versionId: 'version-a' }),
      )
      .mockRejectedValueOnce(new TypeError('offline'));
    const failed = await enqueueKnowledgeCapture({
      ...draft,
      spaceId: 'space-a',
    });
    expect(failed.sourceId).toBe('source-a');
    await retryKnowledgeCapture(failed.id);
    expect(
      mocks.fetch.mock.calls.filter(([url]) =>
        String(url).includes('/knowledge-sources?'),
      ),
    ).toHaveLength(1);
    expect(mocks.fetch.mock.calls.at(-1)?.[0]).toMatch(
      /knowledge-spaces\/space-a\/memberships\/source-a\?brandId=brand-a/,
    );
  });

  it('never retries captures under another user or organization', async () => {
    mocks.fetch.mockRejectedValueOnce(new TypeError('offline'));
    const failed = await enqueueKnowledgeCapture(draft);
    mocks.getAuthContext.mockResolvedValue({
      user: { id: 'user-b' },
      organization: { id: 'org-a' },
    });
    expect(await listKnowledgeCaptures()).toEqual([]);
    await expect(retryKnowledgeCapture(failed.id)).rejects.toThrow(
      'another workspace',
    );
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
  });

  it('reports ready and failed ingestion from the version receipt', async () => {
    await enqueueKnowledgeCapture(draft);
    mocks.fetch.mockResolvedValueOnce(
      response({ id: 'version-a', attributes: { processingState: 'FAILED' } }),
    );
    const failed = (await listKnowledgeCaptures())[0];
    expect(failed.state).toBe('failed');
    mocks.fetch.mockResolvedValueOnce(response({ id: 'version-a' }));
    await retryKnowledgeCapture(failed.id);
    expect(mocks.fetch.mock.calls.at(-1)?.[0]).toContain(
      '/source-a/retry?brandId=brand-a',
    );
    mocks.fetch.mockResolvedValueOnce(
      response({ id: 'version-a', attributes: { processingState: 'READY' } }),
    );
    expect((await listKnowledgeCaptures())[0].state).toBe('ready');
  });

  it('lists only spaces in the selected brand', async () => {
    mocks.fetch.mockResolvedValueOnce(
      response([
        {
          id: 'a',
          attributes: {
            scope: 'brand',
            brandId: 'brand-a',
            title: 'Research',
            isInbox: false,
          },
        },
        { id: 'b', attributes: { scope: 'org', title: 'Org space' } },
      ]),
    );
    expect(await listCaptureSpaces('brand-a')).toEqual([
      { id: 'a', title: 'Research', isInbox: false },
    ]);
  });

  it('bounds offline storage and allows explicit discard', async () => {
    mocks.fetch.mockRejectedValue(new TypeError('offline'));
    for (let i = 0; i < 10; i++)
      await enqueueKnowledgeCapture({ ...draft, title: `Source ${i}` });
    await expect(
      enqueueKnowledgeCapture({ ...draft, title: 'Eleventh' }),
    ).rejects.toThrow('Ten captures');
    await discardKnowledgeCapture((await listKnowledgeCaptures())[0].id);
    expect(await listKnowledgeCaptures()).toHaveLength(9);
  });

  it('migrates older ideas only through explicit brand-scoped ingestion', async () => {
    mocks.store.set('saved_ideas', [
      { id: 'old', title: 'Earlier idea', url: 'https://example.com' },
    ]);
    await importLegacyCaptures('brand-a');
    expect(mocks.store.get('saved_ideas')).toEqual([]);
    expect(JSON.parse(mocks.fetch.mock.calls[0][1].body)).toMatchObject({
      kind: 'URL',
      title: 'Earlier idea',
      scope: 'brand',
    });
  });
});
