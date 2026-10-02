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
import { useBrandStore } from '~store/use-brand-store';
import { loadLibraryAssets } from '~services/library.service';
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
  }) => <img {...props} />,
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
beforeEach(() => {
  useBrandStore.setState({ activeBrandId: 'brand-1', brands: [] });
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
    act(() => useBrandStore.setState({ activeBrandId: 'brand-2' }));
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
    act(() => useBrandStore.setState({ activeBrandId: 'brand-3' }));
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
      'Library unavailable',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(
      await screen.findByRole('option', { name: 'Reference Launch image' }),
    ).not.toBeNull();
  });
});
