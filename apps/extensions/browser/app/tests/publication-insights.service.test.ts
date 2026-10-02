import { AnalyticsMetricAvailability } from '@genfeedai/contracts/enums/analytics-metric-availability.enum';
import { TargetAnalyticsCollectionState } from '@genfeedai/contracts/enums/scheduler.enum';
import type { PublicationInsight } from '@genfeedai/contracts/interfaces/content/publication-insights.interface';
import type { ExtensionWorkspaceSnapshot } from '@genfeedai/contracts/interfaces/extension/extension-workspace.interface';

const snapshot: ExtensionWorkspaceSnapshot = {
  userId: 'user-1',
  organizationId: 'org-1',
  organizationLabel: 'Org',
  brandId: 'brand-1',
  revision: 1,
  isApiKey: false,
  brands: [],
  organizations: [],
};
function insight(patch: Partial<PublicationInsight> = {}): PublicationInsight {
  return {
    id: 'post-1',
    organizationId: 'org-1',
    brandId: 'brand-1',
    source: 'extension',
    platform: 'twitter',
    description: 'Original reply',
    publicationDate: '2026-10-01T00:00:00.000Z',
    isCapturedObservation: true,
    publicationKind: 'reply',
    externalId: '123',
    url: 'https://x.com/author/status/123',
    contextUrl: null,
    urlKind: 'permalink',
    urlIdentity: { kind: 'platform-publication-id', value: '123' },
    observedVisibility: 'unknown',
    credentialId: null,
    analyticsAvailability: 'eligible',
    collectionState: TargetAnalyticsCollectionState.READY,
    collectionMessage: null,
    latestSample: {
      date: '2026-10-01T00:00:00.000Z',
      updatedAt: '2026-10-02T00:00:00.000Z',
      metrics: {
        views: { value: 0, availability: AnalyticsMetricAvailability.OBSERVED },
        likes: {
          value: null,
          availability: AnalyticsMetricAvailability.UNAVAILABLE,
        },
        comments: {
          value: null,
          availability: AnalyticsMetricAvailability.UNAUTHORIZED,
        },
        shares: {
          value: null,
          availability: AnalyticsMetricAvailability.EXPIRED,
        },
        saves: {
          value: null,
          availability: AnalyticsMetricAvailability.FAILED,
        },
      },
    },
    linkCandidates: [{ id: 'account-1', label: 'Original account' }],
    ...patch,
  };
}

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  linkPublicationInsightCredential,
  loadPublicationInsight,
  loadPublicationInsightPage,
  refreshPublicationInsight,
} from '~services/publication-insights.service';

const transport = vi.hoisted(() => ({ request: vi.fn(), assert: vi.fn() }));
vi.mock('~services/workspace.service', () => ({
  scopedWorkspaceRequest: transport.request,
  assertWorkspace: transport.assert,
}));
const lookup = {
  platform: 'twitter',
  pageUrl: 'https://x.com/a/status/123',
} as const;
const options = { snapshot };
const resource = (item = insight()) => ({
  id: item.id,
  type: 'publication-insight',
  attributes: item,
});
const page = (items = [insight()], total = 1) => ({
  data: items.map(resource),
  links: {
    pagination: { page: 1, limit: 10, total, pages: Math.ceil(total / 10) },
  },
});
function respond(body: unknown, status = 200) {
  transport.request.mockResolvedValue(
    new Response(JSON.stringify(body), { status }),
  );
}
beforeEach(() => {
  transport.request.mockReset();
  transport.assert.mockReset();
  respond(page());
});
describe('canonical scoped transport', () => {
  it('uses exact-page query and original identity without source or provider filters', async () => {
    expect(
      (await loadPublicationInsightPage(lookup, 1, options)).items[0]
        .latestSample?.metrics.views.value,
    ).toBe(0);
    const [path, init, scope] = transport.request.mock.calls[0];
    const url = new URL(path, 'https://api.genfeed.ai');
    expect(url.pathname).toBe('/posts/publication-insights');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      brandId: 'brand-1',
      platform: 'twitter',
      pageUrl: lookup.pageUrl,
      page: '1',
      limit: '10',
    });
    expect(scope).toBe(snapshot);
    expect(init.signal).toBeUndefined();
    expect(transport.assert).toHaveBeenCalledWith(snapshot);
  });
  it('encodes detail identity and rejects a returned different post', async () => {
    respond({ data: resource(insight({ id: 'post/a' })) });
    await loadPublicationInsight('post/a', options);
    expect(transport.request.mock.calls[0][0]).toBe(
      '/posts/post%2Fa/publication-insights?brandId=brand-1',
    );
    respond({ data: resource() });
    await expect(
      loadPublicationInsight('other', options),
    ).rejects.toMatchObject({ code: 'invalid-response' });
  });
  it.each([0, -1, 1.5])(
    'does not request an invalid page %s',
    async (number) => {
      await expect(
        loadPublicationInsightPage(lookup, number, options),
      ).rejects.toThrow();
      expect(transport.request).not.toHaveBeenCalled();
    },
  );
  it.each([{ page: 2 }, { limit: 20 }, { pages: 2 }, { total: -1 }])(
    'rejects inconsistent pagination %j',
    async (patch) => {
      const value = page();
      respond({
        ...value,
        links: { pagination: { ...value.links.pagination, ...patch } },
      });
      await expect(
        loadPublicationInsightPage(lookup, 1, options),
      ).rejects.toMatchObject({ code: 'invalid-response' });
    },
  );
  it('rejects malformed JSONAPI, foreign rows and missing fields as a whole', async () => {
    for (const value of [
      { data: insight() },
      page([insight({ organizationId: 'foreign' })]),
      { data: [{ type: 'wrong', id: 'p', attributes: insight() }] },
    ]) {
      respond(value);
      await expect(
        loadPublicationInsightPage(lookup, 1, options),
      ).rejects.toMatchObject({ code: 'invalid-response' });
    }
  });
  it.each([401, 403])(
    'retains scoped identity transport and safe recovery for %s',
    async (status) => {
      respond({ detail: 'secret provider body' }, status);
      await expect(
        loadPublicationInsightPage(lookup, 1, options),
      ).rejects.toMatchObject({
        code: 'forbidden',
        message:
          'Your account or workspace changed. Retry after workspace synchronization.',
      });
      expect(transport.request).toHaveBeenCalledTimes(1);
    },
  );
  it('distinguishes old-server list404 from deleted detail404', async () => {
    respond({}, 404);
    await expect(
      loadPublicationInsightPage(lookup, 1, options),
    ).rejects.toMatchObject({ code: 'unavailable' });
    respond({}, 404);
    await expect(
      loadPublicationInsight('post-1', options),
    ).rejects.toMatchObject({ code: 'not-found' });
  });
  it('keeps offline and 5xx errors fixed without leaking server detail', async () => {
    respond({ detail: 'provider secret' }, 500);
    await expect(
      loadPublicationInsightPage(lookup, 1, options),
    ).rejects.toThrow('Could not load this publication. Retry.');
    transport.request.mockRejectedValue(new Error('secret'));
    await expect(loadPublicationInsight('post-1', options)).rejects.toThrow(
      'Could not load this publication. Retry.',
    );
  });
  it('honors cancellation before sending and after JSON decoding', async () => {
    const abort = new AbortController();
    abort.abort();
    await expect(
      loadPublicationInsightPage(lookup, 1, { snapshot, signal: abort.signal }),
    ).rejects.toThrow();
    expect(transport.request).not.toHaveBeenCalled();
    const next = new AbortController();
    transport.request.mockResolvedValue({
      ok: true,
      json: async () => {
        next.abort();
        return page();
      },
    });
    await expect(
      loadPublicationInsightPage(lookup, 1, { snapshot, signal: next.signal }),
    ).rejects.toThrow();
  });
  it('rejects changed scope after response rather than reacquiring a snapshot', async () => {
    transport.assert
      .mockImplementationOnce(() => undefined)
      .mockImplementationOnce(() => undefined)
      .mockImplementation(() => {
        throw new Error('scope changed');
      });
    await expect(
      loadPublicationInsightPage(lookup, 1, options),
    ).rejects.toThrow('scope changed');
    expect(transport.request.mock.calls[0][2]).toBe(snapshot);
  });
  it('refresh accepts queue acknowledgement without interpreting it as a sample', async () => {
    respond({ queued: true });
    await expect(
      refreshPublicationInsight(insight(), options),
    ).resolves.toBeUndefined();
    expect(transport.request).toHaveBeenCalledWith(
      '/posts/post-1/refresh-analytics?brandId=brand-1',
      expect.objectContaining({ method: 'POST' }),
      snapshot,
    );
    expect(transport.request).toHaveBeenCalledTimes(1);
  });
  it.each([
    'Analytics can only be refreshed once per hour. Please try again in 7 minutes.',
    'provider secret',
    'Analytics can only be refreshed once per hour. Please try again in Infinity minutes.',
  ])('uses only the finite canonical429 message: %s', async (detail) => {
    respond({ detail }, 429);
    await expect(refreshPublicationInsight(insight(), options)).rejects.toThrow(
      detail.includes('7 minutes')
        ? detail
        : 'Analytics can only be refreshed once per hour. Try again later.',
    );
  });
  it('links only an explicitly matched server candidate with exact action payload; no implicit refresh', async () => {
    respond({
      success: true,
      data: {
        postId: 'post-1',
        credentialId: 'account-1',
        analyticsAvailability: 'eligible',
      },
    });
    await linkPublicationInsightCredential(insight(), 'account-1', options);
    const [path, init] = transport.request.mock.calls[0];
    expect(path).toBe(
      '/agent-tools/link_external_publication_credential/execute',
    );
    expect(JSON.parse(init.body)).toEqual({
      parameters: {
        brandId: 'brand-1',
        postId: 'post-1',
        credentialId: 'account-1',
      },
      context: { brandId: 'brand-1' },
    });
    expect(transport.request).toHaveBeenCalledTimes(1);
  });
  it('refuses arbitrary candidates/manual/linked/foreign/ineligible mutations before request', async () => {
    for (const value of [
      insight({ isCapturedObservation: false }),
      insight({ credentialId: 'existing' }),
      insight({ brandId: 'foreign' }),
      insight({ linkCandidates: [] }),
    ])
      await expect(
        linkPublicationInsightCredential(value, 'account-1', options),
      ).rejects.toThrow();
    await expect(
      refreshPublicationInsight(
        insight({ analyticsAvailability: 'missing-credential' }),
        options,
      ),
    ).rejects.toThrow();
    expect(transport.request).not.toHaveBeenCalled();
  });
  it('rejects mismatched link acknowledgement and safely handles conflict', async () => {
    respond({
      success: true,
      data: {
        postId: 'other',
        credentialId: 'account-1',
        analyticsAvailability: 'eligible',
      },
    });
    await expect(
      linkPublicationInsightCredential(insight(), 'account-1', options),
    ).rejects.toMatchObject({ code: 'invalid-response' });
    respond({ detail: 'provider secret' }, 409);
    await expect(
      linkPublicationInsightCredential(insight(), 'account-1', options),
    ).rejects.toThrow(
      'Could not link this account. Reload this publication and choose a matching account.',
    );
  });
});
