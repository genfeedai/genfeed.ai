import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import CloudSyncConsentDialog from './CloudSyncConsentDialog';

describe('CloudSyncConsentDialog', () => {
  it('defaults to metadata-only sync and requires an explicit decision', () => {
    const onDecide = vi.fn();
    render(<CloudSyncConsentDialog isSaving={false} onDecide={onDecide} />);

    expect(
      screen.getByText(
        'Threads sync with your connected Genfeed Cloud account.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/uploadPolicy=never/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Start sync' }));

    expect(onDecide).toHaveBeenCalledWith({
      allowFullAssetUploads: false,
      status: 'granted',
    });
  });

  it('passes full asset permission only after the checkbox is selected', () => {
    const onDecide = vi.fn();
    render(<CloudSyncConsentDialog isSaving={false} onDecide={onDecide} />);

    fireEvent.click(
      screen.getByRole('checkbox', { name: 'Allow full asset uploads' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Start sync' }));

    expect(onDecide).toHaveBeenCalledWith({
      allowFullAssetUploads: true,
      status: 'granted',
    });
  });
});
