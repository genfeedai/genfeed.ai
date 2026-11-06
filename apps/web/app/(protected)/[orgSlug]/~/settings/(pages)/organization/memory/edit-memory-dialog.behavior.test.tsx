// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import {
  createTestQueryClient,
  queryClientWrapper,
} from '@app-tests/query-client.harness';
import type { QueryClient } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import EditMemoryDialog from './edit-memory-dialog';

const correctMock = vi.fn();
const listRevisionsMock = vi.fn();
const notifications = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => {
  const cache = new Map<unknown, () => Promise<unknown>>();
  return {
    useAuthedService: (factory: (token: string) => unknown) => {
      const existing = cache.get(factory.toString());
      if (existing) {
        return existing;
      }
      const resolve = async () => factory('api-token');
      cache.set(factory.toString(), resolve);
      return resolve;
    },
  };
});

vi.mock('@hooks/auth/use-auth-identity/use-auth-identity', async () => ({
  useAuthIdentity: (await import('@app-tests/query-client.harness'))
    .useTestViewer,
}));

vi.mock('@services/automation/agent-memories.service', () => ({
  AgentMemoriesService: {
    getInstance: vi.fn(() => ({
      correct: correctMock,
      listRevisions: listRevisionsMock,
    })),
  },
}));

vi.mock('@services/core/logger.service', () => ({
  logger: { error: vi.fn() },
}));

vi.mock('@services/core/notifications.service', () => ({
  NotificationsService: { getInstance: () => notifications },
}));

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

const entry = {
  content: 'Launch is on the 7th.',
  currentRevisionId: 'revision-2',
  id: 'memory-1',
  scope: 'brand',
};

const revisions = [
  {
    content: 'Launch is on the 7th.',
    createdAt: '2026-10-20T10:00:00.000Z',
    id: 'revision-2',
    isCurrent: true,
    kind: 'correction',
    memoryId: 'memory-1',
    reason: 'The date was wrong',
    revision: 2,
    tags: [],
  },
  {
    content: 'Launch is on the 3rd.',
    createdAt: '2026-10-01T10:00:00.000Z',
    id: 'revision-1',
    isCurrent: false,
    kind: 'original',
    memoryId: 'memory-1',
    revision: 1,
    tags: [],
  },
];

function renderDialog(
  client: QueryClient = createTestQueryClient(),
  openedEntry: typeof entry = entry,
) {
  const onCorrected = vi.fn();
  const onOpenChange = vi.fn();
  const view = render(
    <EditMemoryDialog
      entry={openedEntry}
      onCorrected={onCorrected}
      onOpenChange={onOpenChange}
    />,
    { wrapper: queryClientWrapper(client) },
  );
  return { onCorrected, onOpenChange, unmount: view.unmount };
}

describe('EditMemoryDialog behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listRevisionsMock.mockResolvedValue({ items: revisions, nextCursor: null });
    correctMock.mockResolvedValue({ id: 'revision-3' });
  });

  it('lists the earlier revisions with who they came from and which one is current', async () => {
    renderDialog();

    expect(await screen.findByText('Launch is on the 3rd.')).toBeVisible();
    expect(screen.getByText('The date was wrong')).toBeVisible();
    expect(screen.getByText('Original')).toBeVisible();
    expect(screen.getByText('Current')).toBeVisible();
  });

  it('saves only once the text changed and a reason is given, against the revision it was opened on', async () => {
    const { onCorrected, onOpenChange } = renderDialog();
    await screen.findByText('Launch is on the 3rd.');
    const save = screen.getByRole('button', { name: 'Save correction' });
    expect(save).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Memory'), {
      target: { value: 'Launch is on the 14th.' },
    });
    expect(save).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Why is this changing?'), {
      target: { value: 'The launch moved' },
    });
    expect(save).toBeEnabled();
    fireEvent.click(save);

    await waitFor(() => expect(correctMock).toHaveBeenCalledTimes(1));
    expect(correctMock).toHaveBeenCalledWith('memory-1', {
      content: 'Launch is on the 14th.',
      expectedRevisionId: 'revision-2',
      reason: 'The launch moved',
      requestId: expect.stringMatching(/^[0-9a-f-]{36}$/),
    });
    await waitFor(() => expect(onCorrected).toHaveBeenCalled());
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(notifications.success).toHaveBeenCalledWith('Memory corrected');
  });

  it('retries a failed save with the same request id', async () => {
    correctMock.mockRejectedValueOnce(new Error('network'));
    renderDialog();
    await screen.findByText('Launch is on the 3rd.');
    fireEvent.change(screen.getByLabelText('Memory'), {
      target: { value: 'Launch is on the 14th.' },
    });
    fireEvent.change(screen.getByLabelText('Why is this changing?'), {
      target: { value: 'The launch moved' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Save correction' }));
    await waitFor(() =>
      expect(notifications.error).toHaveBeenCalledWith(
        'Could not save the correction',
      ),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Save correction' }));
    await waitFor(() => expect(correctMock).toHaveBeenCalledTimes(2));

    expect(correctMock.mock.calls[1][1].requestId).toBe(
      correctMock.mock.calls[0][1].requestId,
    );
  });

  it('tells the user when the memory changed underneath them and reloads', async () => {
    correctMock.mockRejectedValueOnce({ response: { status: 409 } });
    const { onCorrected, onOpenChange } = renderDialog();
    await screen.findByText('Launch is on the 3rd.');
    fireEvent.change(screen.getByLabelText('Memory'), {
      target: { value: 'Launch is on the 14th.' },
    });
    fireEvent.change(screen.getByLabelText('Why is this changing?'), {
      target: { value: 'The launch moved' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Save correction' }));

    await waitFor(() =>
      expect(notifications.error).toHaveBeenCalledWith(
        'This memory changed since you opened it. Reload and try again.',
      ),
    );
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onCorrected).toHaveBeenCalled();
  });

  it('paints the cached history at once when the same memory reopens', async () => {
    const client = createTestQueryClient();
    const firstOpen = renderDialog(client);
    expect(await screen.findByText('Launch is on the 3rd.')).toBeVisible();
    firstOpen.unmount();

    listRevisionsMock.mockReturnValue(new Promise(() => {}));
    renderDialog(client);

    expect(screen.getByText('Launch is on the 3rd.')).toBeVisible();
    expect(screen.getByText('The date was wrong')).toBeVisible();
  });

  it('never shows one memory’s history under another memory', async () => {
    const client = createTestQueryClient();
    const firstOpen = renderDialog(client);
    expect(await screen.findByText('Launch is on the 3rd.')).toBeVisible();
    firstOpen.unmount();

    listRevisionsMock.mockReturnValue(new Promise(() => {}));
    renderDialog(client, {
      content: 'Our tone is warm.',
      currentRevisionId: 'revision-9',
      id: 'memory-2',
      scope: 'org',
    });

    expect(screen.queryByText('Launch is on the 3rd.')).not.toBeInTheDocument();
    expect(screen.queryByText('No earlier revisions')).not.toBeInTheDocument();
  });

  it('keeps every revision reachable when a new one lands after older pages loaded', async () => {
    const [current, original] = revisions;
    const revision = (number: number, content: string) => ({
      ...current,
      content,
      id: `revision-${number}`,
      isCurrent: false,
      revision: number,
    });
    listRevisionsMock.mockImplementation(
      async (_id: string, query: { cursor?: string }) =>
        query.cursor === 'after-3'
          ? { items: [original], nextCursor: null }
          : {
              items: [revision(3, 'Launch is on the 9th.'), current],
              nextCursor: 'after-3',
            },
    );
    const client = createTestQueryClient();
    renderDialog(client);
    fireEvent.click(
      await screen.findByRole('button', { name: 'Show older revisions' }),
    );
    expect(await screen.findByText('Launch is on the 3rd.')).toBeVisible();

    // Another correction lands; the first page now ends one revision later.
    listRevisionsMock.mockImplementation(
      async (_id: string, query: { cursor?: string }) =>
        query.cursor === 'after-4'
          ? { items: [current, original], nextCursor: null }
          : {
              items: [
                revision(4, 'Launch is on the 12th.'),
                revision(3, 'Launch is on the 9th.'),
              ],
              nextCursor: 'after-4',
            },
    );
    await client.invalidateQueries();
    expect(await screen.findByText('Launch is on the 12th.')).toBeVisible();

    fireEvent.click(
      await screen.findByRole('button', { name: 'Show older revisions' }),
    );
    expect(await screen.findByText('Launch is on the 7th.')).toBeVisible();
    expect(screen.getByText('Launch is on the 3rd.')).toBeVisible();
  });
});
