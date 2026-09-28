import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@ui/tests/next-intl.stub');

  return { useTranslations: translateFromCatalog };
});

import MasonryFailureNotice from '@ui/masonry/shared/MasonryFailureNotice';

describe('MasonryFailureNotice', () => {
  it('shows the failure reason without a retry for read-only tiles', () => {
    render(
      <MasonryFailureNotice
        failureReason="The model rejected this prompt."
        ingredientId="asset-1"
      />,
    );

    expect(
      screen.getByTestId('asset-failure-reason-asset-1'),
    ).toHaveTextContent('The model rejected this prompt.');
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('retries on click without opening the tile behind it', () => {
    const onRetry = vi.fn();
    const onTileClick = vi.fn();
    const onTileKeyDown = vi.fn();

    render(
      <div onClick={onTileClick} onKeyDown={onTileKeyDown}>
        <MasonryFailureNotice
          failureReason={null}
          ingredientId="asset-2"
          onRetry={onRetry}
        />
      </div>,
    );
    const retry = screen.getByRole('button');

    fireEvent.click(retry);
    fireEvent.keyDown(retry, { key: 'Enter' });
    fireEvent.keyDown(retry, { key: ' ' });

    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onTileClick).not.toHaveBeenCalled();
    expect(onTileKeyDown).not.toHaveBeenCalled();
  });
});
