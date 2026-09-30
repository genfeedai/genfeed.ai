import type { IStudioGenerateDraft } from '@genfeedai/contracts/interfaces';
import type { StudioGenerateDraftPayload } from '@pages/studio/generate/types';
import {
  createStudioGenerateDraftOutbox,
  STUDIO_GENERATE_DRAFT_OUTBOX_STORAGE_PREFIX,
  type StudioGenerateDraftOutbox,
} from '@pages/studio/generate/utils/studio-generate-draft-outbox';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useCallback } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  STUDIO_GENERATE_DRAFT_SAVE_DELAY_MS,
  type UseStudioGenerateDraftParams,
  useStudioGenerateDraft,
} from './useStudioGenerateDraft';

const mocks = vi.hoisted(() => ({
  getCurrent: vi.fn(),
  outbox: { current: null as StudioGenerateDraftOutbox | null },
  saveCurrent: vi.fn(),
  userId: { current: 'user-1' as string | null },
  warning: vi.fn(),
}));

// The outbox is module state; every test gets its own so none leaks.
vi.mock(
  '@pages/studio/generate/utils/studio-generate-draft-outbox',
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import('@pages/studio/generate/utils/studio-generate-draft-outbox')
      >();
    return {
      ...actual,
      get studioGenerateDraftOutbox() {
        return mocks.outbox.current;
      },
    };
  },
);

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () =>
    useCallback(
      async () => ({
        getCurrent: mocks.getCurrent,
        saveCurrent: mocks.saveCurrent,
      }),
      [],
    ),
}));

vi.mock('@hooks/auth/use-auth-identity/use-auth-identity', () => ({
  useAuthIdentity: () => ({ userId: mocks.userId.current }),
}));

vi.mock('@services/content/studio-generate-drafts.service', () => ({
  StudioGenerateDraftsService: { getInstance: vi.fn() },
}));

vi.mock('@services/core/logger.service', () => ({
  logger: { error: vi.fn() },
}));

vi.mock('@services/core/notifications.service', () => ({
  NotificationsService: {
    getInstance: () => ({ warning: mocks.warning }),
  },
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

function buildPayload(prompt: string): StudioGenerateDraftPayload {
  return {
    attachments: [],
    knowledgeSelection: {},
    prompt,
    references: [],
    settingsByType: { image: { outputs: 1 } },
    type: 'image',
  };
}

function buildDraft(prompt: string): IStudioGenerateDraft {
  return {
    ...buildPayload(prompt),
    brandId: 'brand-1',
    createdAt: '2026-09-28T10:00:00.000Z',
    droppedReferenceIds: [],
    id: 'draft-1',
    isDeleted: false,
    organizationId: 'org-1',
    updatedAt: '2026-09-28T10:00:00.000Z',
    userId: 'user-1',
  };
}

function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

const QUIET_PERIOD = STUDIO_GENERATE_DRAFT_SAVE_DELAY_MS + 200;

function renderDraft(overrides: Partial<UseStudioGenerateDraftParams> = {}) {
  const onRestore = vi.fn().mockResolvedValue(0);
  const view = renderHook(
    (props: UseStudioGenerateDraftParams) => useStudioGenerateDraft(props),
    {
      initialProps: {
        brandId: 'brand-1',
        canRestore: true,
        isAutosaveEnabled: true,
        isRestoreBlocked: false,
        onRestore,
        payload: buildPayload(''),
        ...overrides,
      },
    },
  );
  return { ...view, onRestore };
}

function savedPrompts(): string[] {
  return mocks.saveCurrent.mock.calls.map(
    (call) => (call[1] as StudioGenerateDraftPayload).prompt,
  );
}

describe('useStudioGenerateDraft', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    mocks.userId.current = 'user-1';
    mocks.outbox.current = createStudioGenerateDraftOutbox();
    mocks.getCurrent.mockResolvedValue(null);
    mocks.saveCurrent.mockResolvedValue({});
  });

  it('reads and writes the draft of the brand open in this tab', async () => {
    const view = renderDraft();
    await waitFor(() =>
      expect(mocks.getCurrent).toHaveBeenCalledWith(
        'brand-1',
        expect.any(AbortSignal),
      ),
    );

    view.rerender({ ...baseProps(view), payload: buildPayload('A') });

    await waitFor(() =>
      expect(mocks.saveCurrent).toHaveBeenCalledWith(
        'brand-1',
        expect.objectContaining({ prompt: 'A' }),
        { isKeepalive: false },
      ),
    );
  });

  it('keeps typing done before the saved draft arrives, and saves it', async () => {
    const pending = deferred<IStudioGenerateDraft | null>();
    mocks.getCurrent.mockReturnValueOnce(pending.promise);
    const view = renderDraft();
    await waitFor(() => expect(mocks.getCurrent).toHaveBeenCalled());

    view.rerender({ ...baseProps(view), payload: buildPayload('typed now') });
    await act(async () => {
      pending.resolve(buildDraft('older draft'));
    });

    expect(view.onRestore).not.toHaveBeenCalled();
    await waitFor(() => expect(savedPrompts()).toEqual(['typed now']));
  });

  it('saves an Agent handoff that kept the saved draft from restoring', async () => {
    mocks.getCurrent.mockResolvedValueOnce(buildDraft('older draft'));
    const view = renderDraft({
      isRestoreBlocked: true,
      payload: buildPayload('From the Agent'),
    });

    await waitFor(() => expect(savedPrompts()).toEqual(['From the Agent']));
    expect(view.onRestore).not.toHaveBeenCalled();
  });

  it('restores the saved draft and does not write it straight back', async () => {
    mocks.getCurrent.mockResolvedValueOnce(buildDraft('saved'));
    const view = renderDraft({ payload: buildPayload('saved') });

    await waitFor(() => expect(view.onRestore).toHaveBeenCalledTimes(1));
    await new Promise((resolve) => setTimeout(resolve, QUIET_PERIOD));

    expect(mocks.saveCurrent).not.toHaveBeenCalled();
  });

  it('does not create a draft for an untouched, empty composer', async () => {
    renderDraft();
    await waitFor(() => expect(mocks.getCurrent).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, QUIET_PERIOD));

    expect(mocks.saveCurrent).not.toHaveBeenCalled();
  });

  it('saves again when the composer returns to the stored draft mid-save', async () => {
    mocks.getCurrent.mockResolvedValueOnce(buildDraft('A'));
    const view = renderDraft({ payload: buildPayload('A') });
    await waitFor(() => expect(view.onRestore).toHaveBeenCalled());

    const saveB = deferred<unknown>();
    mocks.saveCurrent.mockReturnValueOnce(saveB.promise);
    view.rerender({ ...baseProps(view), payload: buildPayload('B') });
    await waitFor(() => expect(savedPrompts()).toEqual(['B']));

    // Back to what the server held before B, while B is still in flight.
    view.rerender({ ...baseProps(view), payload: buildPayload('A') });
    await new Promise((resolve) => setTimeout(resolve, QUIET_PERIOD));
    await act(async () => {
      saveB.resolve({});
    });

    await waitFor(() => expect(savedPrompts()).toEqual(['B', 'A']));
  });

  it('flushes edits still inside the quiet period when the workspace unmounts', async () => {
    const view = renderDraft();
    await waitFor(() => expect(mocks.getCurrent).toHaveBeenCalled());
    await act(async () => {
      await Promise.resolve();
    });

    view.rerender({ ...baseProps(view), payload: buildPayload('unsaved') });
    view.unmount();

    await waitFor(() =>
      expect(mocks.saveCurrent).toHaveBeenCalledWith(
        'brand-1',
        expect.objectContaining({ prompt: 'unsaved' }),
        { isKeepalive: true },
      ),
    );
  });

  it('saves edits typed during an in-flight save when the workspace unmounts', async () => {
    const view = renderDraft();
    await waitFor(() => expect(mocks.getCurrent).toHaveBeenCalled());
    await act(async () => {
      await Promise.resolve();
    });

    const saveA = deferred<unknown>();
    mocks.saveCurrent.mockReturnValueOnce(saveA.promise);
    view.rerender({ ...baseProps(view), payload: buildPayload('A') });
    await waitFor(() => expect(savedPrompts()).toEqual(['A']));

    // B is typed while A is still in flight, then the creator navigates away.
    view.rerender({ ...baseProps(view), payload: buildPayload('B') });
    view.unmount();
    await act(async () => {
      saveA.resolve({});
    });

    await waitFor(() => expect(savedPrompts()).toEqual(['A', 'B']));
    expect(mocks.saveCurrent).toHaveBeenLastCalledWith(
      'brand-1',
      expect.objectContaining({ prompt: 'B' }),
      { isKeepalive: true },
    );
  });

  it('keeps typing done during a draft load retry over the older draft', async () => {
    mocks.getCurrent
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(buildDraft('older draft'));
    const view = renderDraft();
    await waitFor(() => expect(mocks.getCurrent).toHaveBeenCalledTimes(1));

    // Typed during the retry backoff, before the second attempt starts.
    view.rerender({ ...baseProps(view), payload: buildPayload('typed') });

    await waitFor(() => expect(mocks.getCurrent).toHaveBeenCalledTimes(2), {
      timeout: 4000,
    });
    await waitFor(() => expect(savedPrompts()).toEqual(['typed']));
    expect(view.onRestore).not.toHaveBeenCalled();
  });

  it('replays a draft the previous page never got to send before loading', async () => {
    window.localStorage.setItem(
      `${STUDIO_GENERATE_DRAFT_OUTBOX_STORAGE_PREFIX}:brand-1`,
      JSON.stringify({ ownerId: 'user-1', payload: buildPayload('unsent B') }),
    );
    mocks.getCurrent.mockResolvedValueOnce(buildDraft('unsent B'));
    const view = renderDraft();

    await waitFor(() => expect(mocks.getCurrent).toHaveBeenCalled());
    expect(savedPrompts()).toEqual(['unsent B']);
    expect(mocks.saveCurrent.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.getCurrent.mock.invocationCallOrder[0] ?? 0,
    );
    await waitFor(() => expect(view.onRestore).toHaveBeenCalled());
  });

  it("never replays another user's unsent draft", async () => {
    window.localStorage.setItem(
      `${STUDIO_GENERATE_DRAFT_OUTBOX_STORAGE_PREFIX}:brand-1`,
      JSON.stringify({ ownerId: 'user-2', payload: buildPayload('not mine') }),
    );
    renderDraft();

    await waitFor(() => expect(mocks.getCurrent).toHaveBeenCalled());
    expect(mocks.saveCurrent).not.toHaveBeenCalled();
  });

  it('waits for a write still retrying before reading the draft back', async () => {
    // No storage: this isolates the wait on a retrying in-memory write.
    mocks.outbox.current = createStudioGenerateDraftOutbox({
      getStorage: () => null,
      retryBaseMs: 300,
    });
    const failingThenOk = vi
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({});
    mocks.outbox.current.enqueue('brand-1', buildPayload('pending B'), {
      ownerId: 'user-1',
      write: failingThenOk,
    });
    await waitFor(() => expect(failingThenOk).toHaveBeenCalledTimes(1));

    renderDraft();
    await new Promise((resolve) => setTimeout(resolve, 100));
    // B is waiting on its retry: reading now would restore the older draft.
    expect(mocks.getCurrent).not.toHaveBeenCalled();

    await waitFor(() => expect(failingThenOk).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(mocks.getCurrent).toHaveBeenCalledTimes(1));
  });

  it('never sends a queued draft under another user after an in-tab switch', async () => {
    const view = renderDraft();
    await waitFor(() => expect(mocks.getCurrent).toHaveBeenCalled());
    await act(async () => {
      await Promise.resolve();
    });
    mocks.saveCurrent.mockRejectedValueOnce(new Error('offline'));
    view.rerender({ ...baseProps(view), payload: buildPayload('user-1 text') });
    await waitFor(() => expect(savedPrompts()).toEqual(['user-1 text']));

    // user-2 signs in on this tab while user-1's write waits on its retry.
    mocks.userId.current = 'user-2';
    view.rerender({ ...baseProps(view), payload: buildPayload('user-1 text') });
    await new Promise((resolve) => setTimeout(resolve, 2500));

    expect(savedPrompts()).toEqual(['user-1 text']);
  });

  it('stops on a rejected draft and says it could not be saved', async () => {
    const rejection = Object.assign(new Error('Bad Request'), {
      name: 'ServiceOperationError',
      status: 400,
    });
    mocks.saveCurrent.mockRejectedValue(rejection);
    const view = renderDraft();
    await waitFor(() => expect(mocks.getCurrent).toHaveBeenCalled());
    await act(async () => {
      await Promise.resolve();
    });

    view.rerender({ ...baseProps(view), payload: buildPayload('rejected') });

    await waitFor(() => expect(view.result.current.saveStatus).toBe('failed'));
    await new Promise((resolve) => setTimeout(resolve, 2500));
    expect(mocks.saveCurrent).toHaveBeenCalledTimes(1);
  });

  it('saves pending edits to the brand being left, not the next one', async () => {
    const view = renderDraft();
    await waitFor(() => expect(mocks.getCurrent).toHaveBeenCalledTimes(1));
    await act(async () => {
      await Promise.resolve();
    });

    view.rerender({ ...baseProps(view), payload: buildPayload('for brand 1') });
    view.rerender({
      ...baseProps(view),
      brandId: 'brand-2',
      payload: buildPayload('for brand 1'),
    });

    await waitFor(() =>
      expect(mocks.saveCurrent).toHaveBeenCalledWith(
        'brand-1',
        expect.objectContaining({ prompt: 'for brand 1' }),
        { isKeepalive: true },
      ),
    );
    await waitFor(() =>
      expect(mocks.getCurrent).toHaveBeenLastCalledWith(
        'brand-2',
        expect.any(AbortSignal),
      ),
    );
  });

  it('never autosaves over the stored draft until it has loaded', async () => {
    mocks.getCurrent
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(null);
    const view = renderDraft();
    await waitFor(() => expect(mocks.getCurrent).toHaveBeenCalledTimes(1));

    view.rerender({ ...baseProps(view), payload: buildPayload('typed') });
    await new Promise((resolve) => setTimeout(resolve, QUIET_PERIOD));
    expect(mocks.saveCurrent).not.toHaveBeenCalled();

    // The load is retried; once it succeeds the edit is saved.
    await waitFor(() => expect(mocks.getCurrent).toHaveBeenCalledTimes(2), {
      timeout: 4000,
    });
    await waitFor(() => expect(savedPrompts()).toEqual(['typed']));
  });

  it('does not save while autosave is paused', async () => {
    const view = renderDraft({ isAutosaveEnabled: false });
    await waitFor(() => expect(mocks.getCurrent).toHaveBeenCalled());

    view.rerender({
      ...baseProps(view),
      isAutosaveEnabled: false,
      payload: buildPayload('remix objective'),
    });
    await new Promise((resolve) => setTimeout(resolve, QUIET_PERIOD));
    view.unmount();

    expect(mocks.saveCurrent).not.toHaveBeenCalled();
  });
});

function baseProps(view: {
  onRestore: UseStudioGenerateDraftParams['onRestore'];
}): UseStudioGenerateDraftParams {
  return {
    brandId: 'brand-1',
    canRestore: true,
    isAutosaveEnabled: true,
    isRestoreBlocked: false,
    onRestore: view.onRestore,
    payload: buildPayload(''),
  };
}
