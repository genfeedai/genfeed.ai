import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import CloudSyncConsentDialog from './CloudSyncConsentDialog';

describe('CloudSyncConsentDialog', () => {
  it('defaults to metadata-only sync and focuses the safe action', async () => {
    const onDecide = vi.fn();
    render(
      <CloudSyncConsentDialog
        isSaving={false}
        onDecide={onDecide}
        onDismiss={vi.fn()}
      />,
    );

    expect(
      screen.getByText(
        'Threads sync with your connected Genfeed Cloud account.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/uploadPolicy=never/)).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Not now' })).toHaveFocus(),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Start sync' }));

    expect(onDecide).toHaveBeenCalledWith({
      hasFullAssetUploadConsent: false,
      status: 'granted',
    });
  });

  it('passes full asset permission only after the checkbox is selected', () => {
    const onDecide = vi.fn();
    render(
      <CloudSyncConsentDialog
        isSaving={false}
        onDecide={onDecide}
        onDismiss={vi.fn()}
      />,
    );

    fireEvent.click(
      screen.getByRole('checkbox', { name: 'Allow full asset uploads' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Start sync' }));

    expect(onDecide).toHaveBeenCalledWith({
      hasFullAssetUploadConsent: true,
      status: 'granted',
    });
  });

  it('routes Not now and Escape through the dismiss path', () => {
    const onDismiss = vi.fn();
    const { unmount } = render(
      <CloudSyncConsentDialog
        isSaving={false}
        onDecide={vi.fn()}
        onDismiss={onDismiss}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Not now' }));
    expect(onDismiss).toHaveBeenCalledTimes(1);

    unmount();
    render(
      <CloudSyncConsentDialog
        isSaving={false}
        onDecide={vi.fn()}
        onDismiss={onDismiss}
      />,
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onDismiss).toHaveBeenCalledTimes(2);
  });

  it('cannot be dismissed while consent is saving', () => {
    const onDismiss = vi.fn();
    render(
      <CloudSyncConsentDialog
        isSaving
        onDecide={vi.fn()}
        onDismiss={onDismiss}
      />,
    );

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onDismiss).not.toHaveBeenCalled();
  });
});
