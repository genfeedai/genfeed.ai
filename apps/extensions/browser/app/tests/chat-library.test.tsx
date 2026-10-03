import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatInput } from '~components/chat/ChatInput';
import { loadLibraryAssets } from '~services/library.service';
import { handoffLibraryAsset } from '~services/library-handoff.service';
import { useWorkspaceStore } from '~store/use-workspace-store';

vi.mock('~services/library-handoff.service', () => ({
  handoffLibraryAsset: vi.fn(),
}));
vi.mock('~store/use-workspace-store', async () => {
  const { create } = await import('zustand');
  return { useWorkspaceStore: create(() => ({ status: 'loading' })) };
});
vi.mock('next/image', () => ({
  default: ({
    fill,
    unoptimized,
    sizes,
    ...props
  }: {
    fill?: boolean;
    unoptimized?: boolean;
    sizes?: string;
    src: string;
    alt: string;
  }) => <img {...props} alt={props.alt} />,
}));
vi.mock('~services/library.service', async (importOriginal) => ({
  ...(await importOriginal()),
  loadLibraryAssets: vi.fn(),
}));
const reference = {
  kind: 'ingredient',
  serializer: 'ingredient',
  brandId: 'brand-1',
  organizationId: 'org-1',
  recordId: 'image-1',
} as const;
const item = {
  id: 'image-1',
  brandId: 'brand-1',
  kind: 'image',
  contentTitle: 'Launch image',
  contentType: 'Image',
  thumbnailUrl: 'https://cdn.example/image.png',
  reference,
} as const;
function setWorkspace(
  brandId: string,
  revision: number,
  status: 'ready' | 'refreshing' = 'ready',
) {
  useWorkspaceStore.setState(
    {
      status,
      snapshot: {
        userId: 'user-1',
        organizationId: 'org-1',
        brandId,
        revision,
        brands: [],
        organizations: [],
        organizationLabel: 'Org',
        isApiKey: false,
      },
    },
    true,
  );
}
beforeEach(() => {
  setWorkspace('brand-1', 1);
  vi.mocked(handoffLibraryAsset)
    .mockReset()
    .mockResolvedValue({ kind: 'download-started', downloadId: 1 });
  vi.mocked(loadLibraryAssets)
    .mockReset()
    .mockResolvedValue({ items: [item], hasMore: false });
});
afterEach(cleanup);
async function attach() {
  fireEvent.click(screen.getByRole('button', { name: 'Attach from Library' }));
  fireEvent.click(
    await screen.findByRole('option', { name: 'Reference Launch image' }),
  );
}
describe('shared extension composer and Library picker', () => {
  it('attaches a saved asset preview and sends its scoped record reference', async () => {
    const onSend = vi.fn().mockResolvedValue(true);
    render(<ChatInput onSend={onSend} />);
    expect(screen.getByTestId('prompt-bar-composer')).not.toBeNull();
    await attach();
    expect(screen.getByAltText('Launch image')).not.toBeNull();
    fireEvent.change(
      screen.getByRole('textbox', { name: 'Conversation prompt' }),
      { target: { value: 'Use this image in a post' } },
    );
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
    await waitFor(() =>
      expect(onSend).toHaveBeenCalledWith('Use this image in a post', [
        reference,
      ]),
    );
    await waitFor(() =>
      expect(screen.queryByAltText('Launch image')).toBeNull(),
    );
  });
  it('keeps the draft and assets after a failed send and permits removal', async () => {
    const onSend = vi.fn().mockResolvedValue(false);
    render(<ChatInput onSend={onSend} />);
    await attach();
    const prompt = screen.getByRole('textbox', { name: 'Conversation prompt' });
    fireEvent.change(prompt, { target: { value: 'Try this' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
    await waitFor(() => expect(onSend).toHaveBeenCalled());
    expect((prompt as HTMLTextAreaElement).value).toBe('Try this');
    fireEvent.click(
      screen.getByRole('button', { name: 'Remove Launch image' }),
    );
    expect(screen.queryByAltText('Launch image')).toBeNull();
  });
  it('clears references on a brand change and ignores an obsolete Library response', async () => {
    render(<ChatInput onSend={vi.fn()} />);
    await attach();
    act(() => setWorkspace('brand-2', 2));
    expect(screen.queryByAltText('Launch image')).toBeNull();
    let resolvePage: (
      page: Awaited<ReturnType<typeof loadLibraryAssets>>,
    ) => void = () => {};
    vi.mocked(loadLibraryAssets).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolvePage = resolve;
        }),
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Attach from Library' }),
    );
    act(() => setWorkspace('brand-3', 3));
    await act(async () => resolvePage({ items: [item], hasMore: false }));
    expect(
      screen.queryByRole('option', { name: 'Reference Launch image' }),
    ).toBeNull();
  });
  it('shows Library errors and reloads with Retry', async () => {
    vi.mocked(loadLibraryAssets).mockRejectedValueOnce(
      new Error('Library unavailable'),
    );
    render(<ChatInput onSend={vi.fn()} />);
    fireEvent.click(
      screen.getByRole('button', { name: 'Attach from Library' }),
    );
    expect((await screen.findByRole('alert')).textContent).toContain(
      'Could not load Library',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(
      await screen.findByRole('option', { name: 'Reference Launch image' }),
    ).not.toBeNull();
  });
});

it('debounces server search, retains metadata-only matches and ignores previous query results', async () => {
  render(<ChatInput onSend={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Attach from Library' }));
  await screen.findByRole('option', { name: 'Reference Launch image' });
  const initialCalls = vi.mocked(loadLibraryAssets).mock.calls.length;
  fireEvent.change(
    screen.getByRole('textbox', { name: 'Search library content' }),
    { target: { value: ' metadata + query ' } },
  );
  expect(
    screen.queryByRole('option', { name: 'Reference Launch image' }),
  ).toBeNull();
  expect(loadLibraryAssets).toHaveBeenCalledTimes(initialCalls);
  await screen.findByRole('option', { name: 'Reference Launch image' });
  expect(loadLibraryAssets).toHaveBeenLastCalledWith(
    'brand-1',
    expect.objectContaining({ page: 1, search: 'metadata + query' }),
  );
});
it('failed page2 retries page2 and deduplicates results while retaining selected references across search', async () => {
  const next = {
    ...item,
    id: 'image-2',
    contentTitle: 'Second image',
    reference: { ...reference, recordId: 'image-2' },
  };
  vi.mocked(loadLibraryAssets)
    .mockResolvedValueOnce({ items: [item], hasMore: true })
    .mockRejectedValueOnce(new Error('page2'))
    .mockResolvedValueOnce({ items: [item, next], hasMore: false });
  render(<ChatInput onSend={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Attach from Library' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Load more' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Retry' }));
  await screen.findByRole('option', { name: 'Reference Second image' });
  expect(
    screen.getAllByRole('option', { name: 'Reference Launch image' }),
  ).toHaveLength(1);
  expect(
    vi.mocked(loadLibraryAssets).mock.calls.map(([, options]) => options?.page),
  ).toEqual([1, 2, 2]);
  fireEvent.click(
    screen.getByRole('option', { name: 'Reference Launch image' }),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Attach from Library' }));
  fireEvent.change(
    screen.getByRole('textbox', { name: 'Search library content' }),
    { target: { value: 'different' } },
  );
  expect(screen.getByAltText('Launch image')).toBeInTheDocument();
});
it('pauses requests/actions during refreshing and retains drafts/references', async () => {
  render(<ChatInput onSend={vi.fn()} />);
  await attach();
  fireEvent.change(
    screen.getByRole('textbox', { name: 'Conversation prompt' }),
    { target: { value: 'Retained draft' } },
  );
  act(() => setWorkspace('brand-1', 1, 'refreshing'));
  expect(screen.getByAltText('Launch image')).toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: 'Download Launch image' }),
  ).toBeDisabled();
  expect(
    screen.getByRole('textbox', { name: 'Conversation prompt' }),
  ).toHaveValue('Retained draft');
});
it('explicit attachment handoff reports started, preserves references and never automatically opens after failure', async () => {
  render(<ChatInput onSend={vi.fn()} />);
  await attach();
  fireEvent.click(
    screen.getByRole('button', { name: 'Download Launch image' }),
  );
  expect(
    await screen.findByText(
      'Download started. Attach the file using the platform’s attachment button.',
    ),
  ).toBeInTheDocument();
  expect(screen.getByAltText('Launch image')).toBeInTheDocument();
  vi.mocked(handoffLibraryAsset).mockRejectedValueOnce(
    new Error('secret signed URL'),
  );
  fireEvent.click(
    screen.getByRole('button', { name: 'Download Launch image' }),
  );
  expect(
    await screen.findByText(/Could not retrieve this asset/),
  ).toBeInTheDocument();
  expect(screen.queryByText('secret signed URL')).toBeNull();
  expect(
    vi.mocked(handoffLibraryAsset).mock.calls.map(([, action]) => action),
  ).toEqual(['download', 'download']);
  vi.mocked(handoffLibraryAsset).mockResolvedValueOnce({
    kind: 'asset-opened',
  });
  fireEvent.click(screen.getByRole('button', { name: 'Open Launch image' }));
  expect(
    await screen.findByText(
      'Asset opened. Save it, then attach it using the platform’s attachment button.',
    ),
  ).toBeInTheDocument();
});

it('waits exactly 250ms after search and discards an old response after query change or close', async () => {
  let finish!: (page: Awaited<ReturnType<typeof loadLibraryAssets>>) => void;
  vi.mocked(loadLibraryAssets).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  render(<ChatInput onSend={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Attach from Library' }));
  vi.useFakeTimers();
  try {
    fireEvent.change(
      screen.getByRole('textbox', { name: 'Search library content' }),
      { target: { value: 'new query' } },
    );
    await act(async () => finish({ items: [item], hasMore: false }));
    expect(
      screen.queryByRole('option', { name: 'Reference Launch image' }),
    ).toBeNull();
    await act(async () => vi.advanceTimersByTimeAsync(249));
    expect(loadLibraryAssets).toHaveBeenCalledTimes(1);
    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(loadLibraryAssets).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    fireEvent.click(
      screen.getByRole('button', { name: 'Attach from Library' }),
    );
    expect(loadLibraryAssets).toHaveBeenLastCalledWith(
      'brand-1',
      expect.objectContaining({ page: 1, search: '' }),
    );
  } finally {
    vi.useRealTimers();
  }
});
it('closing invalidates pending results and preserves the selected reference', async () => {
  render(<ChatInput onSend={vi.fn()} />);
  await attach();
  let finish!: (page: Awaited<ReturnType<typeof loadLibraryAssets>>) => void;
  vi.mocked(loadLibraryAssets).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Attach from Library' }));
  fireEvent.click(screen.getByRole('button', { name: 'Close' }));
  await act(async () =>
    finish({
      items: [{ ...item, contentTitle: 'Late asset' }],
      hasMore: false,
    }),
  );
  expect(screen.queryByText('Late asset')).toBeNull();
  expect(screen.getByAltText('Launch image')).toBeInTheDocument();
});
it('removing an asset aborts pending handoff and ignores its late status', async () => {
  let finish!: (result: {
    kind: 'download-started';
    downloadId: number;
  }) => void;
  vi.mocked(handoffLibraryAsset).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  render(<ChatInput onSend={vi.fn()} />);
  await attach();
  fireEvent.click(
    screen.getByRole('button', { name: 'Download Launch image' }),
  );
  const signal = vi.mocked(handoffLibraryAsset).mock.calls[0][2]?.signal;
  expect(
    screen.getByRole('button', { name: 'Download Launch image' }),
  ).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Remove Launch image' }));
  expect(signal?.aborted).toBe(true);
  await act(async () => finish({ kind: 'download-started', downloadId: 2 }));
  expect(screen.queryByText(/Download started/)).toBeNull();
});
