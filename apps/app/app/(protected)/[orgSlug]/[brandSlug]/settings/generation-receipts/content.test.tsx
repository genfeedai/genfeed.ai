const hash = `sha256:${'a'.repeat(64)}`;
const time = '2026-10-01T00:00:00.000Z';
function receipt() {
  return {
    schemaVersion: 1,
    id: 'receipt',
    organizationId: 'org',
    brandId: 'brand',
    actorId: 'PRIVATE_ACTOR',
    requestKey: 'PRIVATE_REQUEST',
    candidateIndex: 0,
    requestHash: hash,
    revision: 0,
    state: 'created',
    mode: 'raw',
    surface: 'api',
    contentType: 'post',
    format: 'text',
    createdAt: time,
    updatedAt: time,
    snapshot: null,
    resolutionHash: null,
    layers: [],
    learning: null,
    prompts: {
      original: { contentHash: hash, retention: 'pending' },
      enhanced: null,
      compiled: null,
    },
    execution: null,
    artifact: null,
    validation: null,
    compliance: 'not_claimed',
    diagnostics: [],
    costs: [{ id: 'cost', stage: 'generation', status: 'pending' }],
    budget: {
      version: 'brand-enforcement-v1',
      maximumGenerationAttempts: 1,
      automaticPaidRetries: 0,
      generationAttemptsUsed: 0,
    },
    isDeleted: false,
  };
}
function publicReceipt() {
  const { actorId: _actor, requestKey: _key, ...value } = receipt();
  return {
    ...value,
    platform: null,
    parentRequestId: null,
    runId: null,
    workflowExecutionId: null,
    generationId: null,
  };
}

import '@testing-library/jest-dom/vitest';
import {
  axiosResponse,
  collectionDocument,
  installMockHttp,
  resourceDocument,
} from '@services/__mocks__/http.mock';
import { BrandedGenerationReceiptsService } from '@services/ai/branded-generation-receipts.service';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  query: new URLSearchParams(),
  brand: { id: 'brand', slug: 'moonrise' },
  org: 'org',
  getService: vi.fn(),
  generate: vi.fn(),
  evaluate: vi.fn(),
  publish: vi.fn(),
}));
vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});
vi.mock('next/navigation', () => ({
  useParams: () => ({ orgSlug: 'acme', brandSlug: 'moonrise' }),
  useSearchParams: () => mocks.query,
}));
vi.mock('@genfeedai/contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({ organizationId: mocks.org }),
}));
vi.mock('@hooks/pages/use-brand-detail/use-brand-detail', () => ({
  useBrandDetail: () => ({
    brand: mocks.brand,
    brandId: mocks.brand.id,
    hasBrandId: true,
    isLoading: false,
  }),
}));
vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({ href: (path: string) => `/acme/moonrise${path}` }),
}));
vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => mocks.getService,
}));

import GenerationReceiptsContent from './content';

let http: ReturnType<typeof installMockHttp>;
function metadata() {
  const value = publicReceipt();
  return {
    ...value,
    prompts: {
      ...value.prompts,
      original: {
        contentHash: hash,
        retention: 'retained',
        snapshotId: 'snapshot',
      },
    },
  };
}
function respond() {
  const handler = async (path: string) => {
    const brandId = path.split('/')[0];
    const receiptId = path.split('/')[2] ?? 'receipt';
    const value = {
      ...metadata(),
      organizationId: mocks.org,
      brandId,
      id: receiptId,
    };
    if (path.endsWith('/prompts/original')) {
      const prompt = {
        id: `${receiptId}:1:original`,
        receiptId,
        receiptRevision: 1,
        stage: 'original',
        status: 'retained',
        text: '<script>saved prompt only</script> 🎨',
        contentHash: hash,
        reasonCode: null,
      };
      return axiosResponse(
        resourceDocument(prompt, {
          id: prompt.id,
          type: 'branded-generation-prompt-inspection',
        }),
      );
    }
    if (path.endsWith('/history'))
      return axiosResponse({
        ...collectionDocument(
          [{ ...value, id: `${receiptId}:1`, receiptId, revision: 1 }],
          { type: 'branded-generation-receipt-revision' },
        ),
        links: { cursor: { hasMore: false, limit: 10, nextCursor: null } },
      });
    if (path.endsWith('/revisions/1'))
      return axiosResponse(
        resourceDocument(
          { ...value, id: `${receiptId}:1`, receiptId, revision: 1 },
          { id: `${receiptId}:1`, type: 'branded-generation-receipt-revision' },
        ),
      );
    if (path === `${brandId}/generation-receipts/${receiptId}`)
      return axiosResponse(
        resourceDocument(value, {
          id: receiptId,
          type: 'branded-generation-receipt',
        }),
      );
    return axiosResponse({
      ...collectionDocument([value], { type: 'branded-generation-receipt' }),
      links: { cursor: { hasMore: false, limit: 10, nextCursor: null } },
    });
  };
  http.get.mockImplementation(handler);
  return handler;
}
describe('mounted saved receipt customer read flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.query = new URLSearchParams();
    mocks.brand = { id: 'brand', slug: 'moonrise' };
    mocks.org = 'org';
    const service = new BrandedGenerationReceiptsService('test-token');
    http = installMockHttp(service);
    mocks.getService.mockResolvedValue(service);
    respond();
  });
  it('lists, selects, explicitly loads history, pins a revision and reveals through the actual shared inspector/client', async () => {
    const view = render(<GenerationReceiptsContent />);
    const row = await screen.findByRole('link', { name: /receipt · created/ });
    expect(row).toHaveAttribute(
      'href',
      '/acme/moonrise/settings/generation-receipts?receiptId=receipt',
    );
    expect(
      http.get.mock.calls.some(([path]) => path.includes('/prompts/')),
    ).toBe(false);
    mocks.query = new URLSearchParams('receiptId=receipt');
    view.rerender(<GenerationReceiptsContent />);
    await screen.findByRole('button', { name: 'Show saved prompt · original' });
    expect(
      http.get.mock.calls.some(([path]) => path.endsWith('/history')),
    ).toBe(false);
    fireEvent.click(
      screen.getByRole('button', { name: 'Show revision history' }),
    );
    const revision = await screen.findByRole('link', {
      name: /Receipt revision 1/,
    });
    expect(revision).toHaveAttribute(
      'href',
      '/acme/moonrise/settings/generation-receipts?receiptId=receipt&revision=1',
    );
    mocks.query = new URLSearchParams('receiptId=receipt&revision=1');
    view.rerender(<GenerationReceiptsContent />);
    await waitFor(() =>
      expect(http.get).toHaveBeenCalledWith(
        'brand/generation-receipts/receipt/revisions/1',
        { signal: expect.any(AbortSignal) },
      ),
    );
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Show saved prompt · original',
      }),
    );
    await screen.findByText('<script>saved prompt only</script> 🎨');
    expect(view.container.querySelector('script')).toBeNull();
    expect(http.get).toHaveBeenCalledWith(
      'brand/generation-receipts/receipt/prompts/original',
      { params: { revision: 1 }, signal: expect.any(AbortSignal) },
    );
    for (const method of ['post', 'put', 'patch', 'delete'] as const)
      expect(http[method]).not.toHaveBeenCalled();
    for (const action of [mocks.generate, mocks.evaluate, mocks.publish])
      expect(action).not.toHaveBeenCalled();
  });
  it.each([
    'revision=1',
    'receiptId=a&receiptId=b',
    'receiptId=receipt&revision=01',
    'receiptId=receipt&revision=2147483648',
  ])(
    'rejects invalid selected URL %s without guessing a receipt',
    async (query) => {
      mocks.query = new URLSearchParams(query);
      render(<GenerationReceiptsContent />);
      await screen.findByText('This receipt link is invalid.');
      expect(
        http.get.mock.calls.some(([path]) => path.includes('/receipt/')),
      ).toBe(false);
    },
  );
  it('does not use a selected-brand fallback for an unmatched route', () => {
    mocks.brand = { id: 'other', slug: 'other' };
    render(<GenerationReceiptsContent />);
    expect(screen.getByRole('alert')).toHaveTextContent(
      'This generation is unavailable',
    );
    expect(http.get).not.toHaveBeenCalled();
  });
  it('clears selected plaintext after scope replacement', async () => {
    mocks.query = new URLSearchParams('receiptId=receipt&revision=1');
    const view = render(<GenerationReceiptsContent />);
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Show saved prompt · original',
      }),
    );
    await screen.findByText('<script>saved prompt only</script> 🎨');
    mocks.org = 'other-org';
    view.rerender(<GenerationReceiptsContent />);
    expect(screen.queryByText(/saved prompt only/)).toBeNull();
  });
  it('loads only explicit list/history cursor pages and preserves the selected revision', async () => {
    http.get.mockImplementation(
      async (
        path: string,
        options: { params?: { cursor?: string; afterRevision?: number } },
      ) => {
        const value = metadata();
        if (path.endsWith('/history')) {
          const revision = options.params?.afterRevision === undefined ? 1 : 2;
          return axiosResponse({
            ...collectionDocument(
              [
                {
                  ...value,
                  id: `receipt:${revision}`,
                  receiptId: 'receipt',
                  revision,
                },
              ],
              { type: 'branded-generation-receipt-revision' },
            ),
            links: {
              cursor: {
                hasMore: revision === 1,
                limit: 10,
                nextCursor: revision === 1 ? '1' : null,
              },
            },
          });
        }
        if (path.endsWith('/receipt'))
          return axiosResponse(
            resourceDocument(value, {
              id: 'receipt',
              type: 'branded-generation-receipt',
            }),
          );
        const second = options.params?.cursor === 'next';
        return axiosResponse({
          ...collectionDocument(
            [{ ...value, id: second ? 'second' : 'receipt' }],
            { type: 'branded-generation-receipt' },
          ),
          links: {
            cursor: {
              hasMore: !second,
              limit: 10,
              nextCursor: second ? null : 'next',
            },
          },
        });
      },
    );
    const view = render(<GenerationReceiptsContent />);
    await screen.findByRole('link', { name: /receipt · created/ });
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }));
    await screen.findByRole('link', { name: /second · created/ });
    expect(http.get).toHaveBeenCalledWith('brand/generation-receipts', {
      params: { limit: 10, cursor: 'next' },
      signal: expect.any(AbortSignal),
    });
    mocks.query = new URLSearchParams('receiptId=receipt');
    view.rerender(<GenerationReceiptsContent />);
    fireEvent.click(
      await screen.findByRole('button', { name: 'Show revision history' }),
    );
    await screen.findByRole('link', { name: /Receipt revision 1/ });
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }));
    await screen.findByRole('link', { name: /Receipt revision 2/ });
    expect(http.get).toHaveBeenCalledWith(
      'brand/generation-receipts/receipt/history',
      {
        params: { limit: 10, afterRevision: 1 },
        signal: expect.any(AbortSignal),
      },
    );
    expect(
      http.get.mock.calls.some(([path]) => path.includes('/prompts/')),
    ).toBe(false);
  });
  it('shows empty and safe error states, and ignores a late list after losing the route scope', async () => {
    http.get.mockResolvedValueOnce(
      axiosResponse({
        ...collectionDocument([], { type: 'branded-generation-receipt' }),
        links: { cursor: { hasMore: false, limit: 10, nextCursor: null } },
      }),
    );
    const view = render(<GenerationReceiptsContent />);
    await screen.findByText('No generation receipts yet.');
    http.get.mockRejectedValueOnce({
      isAxiosError: true,
      response: { status: 500 },
      message: 'PRIVATE',
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Reload saved details' }),
    );
    await screen.findByText(
      'Could not load saved generation details. Try again.',
    );
    expect(screen.queryByText('PRIVATE')).toBeNull();
    let resolve!: (value: ReturnType<typeof axiosResponse>) => void;
    http.get.mockReturnValueOnce(
      new Promise((done) => {
        resolve = done;
      }),
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Reload saved details' }),
    );
    await screen.findByRole('status');
    mocks.brand = { id: 'other', slug: 'other' };
    view.rerender(<GenerationReceiptsContent />);
    resolve(
      axiosResponse({
        ...collectionDocument([metadata()], {
          type: 'branded-generation-receipt',
        }),
        links: { cursor: { hasMore: false, limit: 10, nextCursor: null } },
      }),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole('link', { name: /receipt · created/ }),
      ).toBeNull(),
    );
  });
  function paginated(kind: 'list' | 'history', firstRevision = 1) {
    const fallback = respond();
    http.get.mockImplementation(
      async (
        path: string,
        options: { params?: { cursor?: string; afterRevision?: number } },
      ) => {
        const target =
          kind === 'history'
            ? path.endsWith('/history')
            : path.endsWith('/generation-receipts');
        if (!target) return fallback(path);
        const continuation =
          kind === 'history'
            ? options.params?.afterRevision !== undefined
            : options.params?.cursor !== undefined;
        const revision = continuation ? firstRevision + 1 : firstRevision;
        const value = {
          ...metadata(),
          organizationId: mocks.org,
          brandId: path.split('/')[0],
        };
        const historyReceiptId = path.split('/')[2];
        const items =
          kind === 'history'
            ? [
                {
                  ...value,
                  id: `${historyReceiptId}:${revision}`,
                  receiptId: historyReceiptId,
                  revision,
                },
              ]
            : [{ ...value, id: continuation ? 'second' : 'receipt' }];
        return axiosResponse({
          ...collectionDocument(items, {
            type:
              kind === 'history'
                ? 'branded-generation-receipt-revision'
                : 'branded-generation-receipt',
          }),
          links: {
            cursor: {
              hasMore: !continuation,
              limit: 10,
              nextCursor: continuation
                ? null
                : kind === 'history'
                  ? String(firstRevision)
                  : 'next',
            },
          },
        });
      },
    );
  }
  async function mountedPage(kind: 'list' | 'history', firstRevision = 1) {
    paginated(kind, firstRevision);
    if (kind === 'history')
      mocks.query = new URLSearchParams('receiptId=receipt&revision=1');
    const view = render(<GenerationReceiptsContent />);
    await screen.findByRole('link', { name: /receipt · created/ });
    if (kind === 'history') {
      await screen.findByRole('button', {
        name: 'Show saved prompt · original',
      });
      fireEvent.click(
        screen.getByRole('button', { name: 'Show revision history' }),
      );
      await screen.findByRole('link', {
        name: new RegExp(`Receipt revision ${firstRevision} ·`),
      });
    }
    return view;
  }
  it.each([
    { kind: 'list' as const, firstRevision: 1 },
    { kind: 'history' as const, firstRevision: 1 },
    { kind: 'history' as const, firstRevision: 0 },
  ])(
    'retains $kind page after continuation failure and retries its identical cursor (revision $firstRevision)',
    async ({ kind, firstRevision }) => {
      await mountedPage(kind, firstRevision);
      const initialName =
        kind === 'history'
          ? new RegExp(`Receipt revision ${firstRevision} ·`)
          : /receipt · created/;
      http.get.mockRejectedValueOnce({
        isAxiosError: true,
        response: { status: 500 },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Load more' }));
      await screen.findByText(
        'Could not load saved generation details. Try again.',
      );
      expect(screen.getByRole('link', { name: initialName })).toBeVisible();
      fireEvent.click(screen.getByRole('button', { name: 'Load more' }));
      const secondName =
        kind === 'history'
          ? new RegExp(`Receipt revision ${firstRevision + 1} ·`)
          : /second · created/;
      await screen.findByRole('link', { name: secondName });
      expect(screen.getAllByRole('link', { name: initialName })).toHaveLength(
        1,
      );
      expect(screen.getAllByRole('link', { name: secondName })).toHaveLength(1);
      const path =
        kind === 'history'
          ? 'brand/generation-receipts/receipt/history'
          : 'brand/generation-receipts';
      const params =
        kind === 'history'
          ? { limit: 10, afterRevision: firstRevision }
          : { limit: 10, cursor: 'next' };
      const continuations = http.get.mock.calls.filter(
        ([url, options]) =>
          url === path &&
          (kind === 'history'
            ? options.params?.afterRevision !== undefined
            : options.params?.cursor !== undefined),
      );
      expect(continuations).toHaveLength(2);
      for (const call of continuations)
        expect(call).toEqual([
          path,
          { params, signal: expect.any(AbortSignal) },
        ]);
      if (kind === 'history') {
        expect(mocks.query.get('revision')).toBe('1');
        expect(http.get).toHaveBeenCalledWith(
          'brand/generation-receipts/receipt/revisions/1',
          { signal: expect.any(AbortSignal) },
        );
      }
      expect(
        http.get.mock.calls.some(([url]) => url.includes('/prompts/')),
      ).toBe(false);
    },
  );
  it.each(['list', 'history'] as const)(
    'preserves %s continuation metadata after unknown network failure',
    async (kind) => {
      await mountedPage(kind);
      http.get.mockRejectedValueOnce(new Error('network offline'));
      fireEvent.click(screen.getByRole('button', { name: 'Load more' }));
      await screen.findByText(
        'Could not load saved generation details. Try again.',
      );
      expect(
        screen.getByRole('link', {
          name:
            kind === 'history' ? /Receipt revision 1 ·/ : /receipt · created/,
        }),
      ).toBeVisible();
      expect(screen.getByRole('button', { name: 'Load more' })).toBeEnabled();
      expect(
        http.get.mock.calls.some(([url]) => url.includes('/prompts/')),
      ).toBe(false);
    },
  );
  it.each([
    { status: 401 },
    { status: 403 },
    { status: 404 },
    { statusCode: 403 },
    { isAuthError: true },
    { isAxiosError: true, response: { status: 404 } },
    { response: { data: { errors: [{ status: 403 }] } } },
  ])(
    'clears list and history rows and cursors for unavailable continuation %#',
    async (error) => {
      const list = await mountedPage('list');
      http.get.mockRejectedValueOnce(error);
      fireEvent.click(screen.getByRole('button', { name: 'Load more' }));
      await screen.findByText(
        'Could not load saved generation details. Try again.',
      );
      expect(
        screen.queryByRole('link', { name: /receipt · created/ }),
      ).toBeNull();
      expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull();
      list.unmount();
      respond();
      await mountedPage('history', 0);
      http.get.mockRejectedValueOnce(error);
      fireEvent.click(screen.getByRole('button', { name: 'Load more' }));
      await screen.findByText(
        'Could not load saved generation details. Try again.',
      );
      expect(
        screen.queryByRole('link', { name: /Receipt revision 0 ·/ }),
      ).toBeNull();
      expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull();
      expect(
        http.get.mock.calls.some(([url]) => url.includes('/prompts/')),
      ).toBe(false);
    },
  );
  it('clears successful history when a fresh first page fails', async () => {
    await mountedPage('history');
    http.get.mockRejectedValueOnce(new Error('first page failed'));
    fireEvent.click(
      screen.getByRole('button', { name: 'Show revision history' }),
    );
    await screen.findByText(
      'Could not load saved generation details. Try again.',
    );
    expect(
      screen.queryByRole('link', { name: /Receipt revision 1 ·/ }),
    ).toBeNull();
    expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull();
  });
  it.each([
    { kind: 'list' as const, scope: 'org' },
    { kind: 'list' as const, scope: 'brand' },
    { kind: 'list' as const, scope: 'service' },
    { kind: 'history' as const, scope: 'org' },
    { kind: 'history' as const, scope: 'brand' },
    { kind: 'history' as const, scope: 'service' },
    { kind: 'history' as const, scope: 'receipt' },
  ])(
    'ignores pending $kind failure after $scope identity changes',
    async ({ kind, scope }) => {
      const view = await mountedPage(kind, 0);
      let reject!: (error: unknown) => void;
      http.get.mockReturnValueOnce(
        new Promise((_resolve, fail) => {
          reject = fail;
        }),
      );
      fireEvent.click(screen.getByRole('button', { name: 'Load more' }));
      await waitFor(() =>
        expect(
          screen.getByRole('button', { name: 'Load more' }),
        ).toBeDisabled(),
      );
      if (scope === 'org') mocks.org = 'other-org';
      if (scope === 'brand') mocks.brand = { id: 'other', slug: 'moonrise' };
      if (scope === 'receipt')
        mocks.query = new URLSearchParams('receiptId=other&revision=1');
      if (scope === 'service') {
        const service = new BrandedGenerationReceiptsService('replacement');
        http = installMockHttp(service);
        mocks.getService = vi.fn().mockResolvedValue(service);
      }
      respond();
      if (kind === 'list') {
        http.get.mockResolvedValueOnce(
          axiosResponse({
            ...collectionDocument(
              [{ ...metadata(), brandId: mocks.brand.id, id: 'new-scope' }],
              { type: 'branded-generation-receipt' },
            ),
            links: {
              cursor: { hasMore: true, limit: 10, nextCursor: 'new-cursor' },
            },
          }),
        );
      } else paginated('history', 3);
      // The next scope has its own successful page and cursor; the pending request cannot clear either.
      view.rerender(<GenerationReceiptsContent />);
      if (kind === 'list') {
        await screen.findByRole('link', { name: /new-scope · created/ });
        expect(
          screen.queryByRole('link', { name: /receipt · created/ }),
        ).toBeNull();
      } else {
        expect(
          screen.queryByRole('link', { name: /Receipt revision 0 ·/ }),
        ).toBeNull();
        fireEvent.click(
          screen.getByRole('button', { name: 'Show revision history' }),
        );
        await screen.findByRole('link', { name: /Receipt revision 3 ·/ });
      }
      await act(async () => {
        reject({ isAuthError: true });
      });
      await waitFor(() => {
        expect(
          screen.queryByText(
            'Could not load saved generation details. Try again.',
          ),
        ).toBeNull();
        expect(screen.getByRole('button', { name: 'Load more' })).toBeEnabled();
        if (kind === 'history') {
          expect(
            screen.queryByRole('link', { name: /Receipt revision 0 ·/ }),
          ).toBeNull();
          expect(
            screen.getByRole('link', { name: /Receipt revision 3 ·/ }),
          ).toBeVisible();
        } else
          expect(
            screen.getByRole('link', { name: /new-scope · created/ }),
          ).toBeVisible();
      });
      fireEvent.click(screen.getByRole('button', { name: 'Load more' }));
      await waitFor(() =>
        expect(http.get).toHaveBeenCalledWith(
          kind === 'history'
            ? `${mocks.brand.id}/generation-receipts/${mocks.query.get('receiptId')}/history`
            : `${mocks.brand.id}/generation-receipts`,
          {
            params:
              kind === 'history'
                ? { limit: 10, afterRevision: 3 }
                : { limit: 10, cursor: 'new-cursor' },
            signal: expect.any(AbortSignal),
          },
        ),
      );
      expect(
        http.get.mock.calls.some(([url]) => url.includes('/prompts/')),
      ).toBe(false);
    },
  );
});
