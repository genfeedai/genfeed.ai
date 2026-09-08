import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { KnowledgeCapturePage } from '~components/pages/KnowledgeCapturePage';
import { useBrandStore } from '~store/use-brand-store';

vi.mock('~components/settings/BrandSelector', () => ({
  BrandSelector: () => (
    <button
      type="button"
      onClick={() => useBrandStore.getState().setActiveBrand('brand-a')}
    >
      Choose Brand A
    </button>
  ),
}));

beforeEach(() => {
  useBrandStore.setState({ activeBrandId: null, brands: [] });
  vi.mocked(chrome.runtime.sendMessage).mockImplementation(async (message) => {
    if (message.event === 'captureList' || message.event === 'captureSpaces')
      return { success: true, data: [] };
    if (message.event === 'captureBrand') return { success: true, data: null };
    if (message.event === 'captureLegacyCount')
      return { success: true, data: 0 };
    if (message.event === 'captureSave')
      return { success: true, data: { id: 'capture-a', state: 'queued' } };
    return { success: false, error: 'Unsupported fixture request' };
  });
});

describe('Knowledge capture panel', () => {
  it('provides no-brand recovery and saves the reviewed text to the chosen brand', async () => {
    render(
      <KnowledgeCapturePage
        initialContent="Captured passage"
        initialUrl="https://example.com/article"
      />,
    );
    const save = screen.getByRole('button', { name: 'Save to Genfeed' });
    expect(save).toBeDisabled();
    expect(
      screen.getByRole('link', { name: 'Open Genfeed to create a brand' }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Choose Brand A' }));
    fireEvent.change(screen.getByLabelText('Title'), {
      target: { value: 'Useful research' },
    });
    fireEvent.click(save);
    await waitFor(() =>
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'captureSave',
          payload: expect.objectContaining({
            brandId: 'brand-a',
            text: 'Captured passage',
            title: 'Useful research',
            purpose: 'INSPIRATION',
          }),
        }),
      ),
    );
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Capture submitted' }),
      ).toBeDisabled(),
    );
  });

  it('retains editable evidence when submission fails', async () => {
    useBrandStore.setState({ activeBrandId: 'brand-a' });
    vi.mocked(chrome.runtime.sendMessage).mockImplementation(
      async (message) => {
        if (message.event === 'captureSave')
          return { success: false, error: 'Select an accessible brand.' };
        if (message.event === 'captureLegacyCount')
          return { success: true, data: 0 };
        if (message.event === 'captureBrand')
          return { success: true, data: null };
        return { success: true, data: [] };
      },
    );
    render(<KnowledgeCapturePage initialContent="Keep this evidence" />);
    fireEvent.click(screen.getByRole('button', { name: 'Save to Genfeed' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Select an accessible brand.',
    );
    expect(screen.getByLabelText('Captured text')).toHaveValue(
      'Keep this evidence',
    );
    expect(
      screen.getByRole('button', { name: 'Save to Genfeed' }),
    ).toBeEnabled();
  });
});
