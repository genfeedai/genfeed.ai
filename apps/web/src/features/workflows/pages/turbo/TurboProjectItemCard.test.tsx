import '@testing-library/jest-dom/vitest';
import { TurboProjectItemStatus } from '@genfeedai/contracts';
import type { ITurboProjectItem } from '@genfeedai/contracts/interfaces';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import TurboProjectItemCard from './TurboProjectItemCard';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@/../tests/next-intl.stub');
  return { useLocale: () => 'en', useTranslations: translateFromCatalog };
});
vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => vi.fn().mockResolvedValue({ findOne: vi.fn() }),
}));
vi.mock('@ui/collection/CollectionItemActions', () => ({
  default: ({
    overflow,
  }: {
    overflow: Array<{ id: string; label: string; onSelect: () => void }>;
  }): ReactNode => (
    <div>
      {overflow.map((action) => (
        <button key={action.id} type="button" onClick={action.onSelect}>
          {action.label}
        </button>
      ))}
    </div>
  ),
}));

const readyItem = {
  id: 'item-1',
  position: 0,
  projectId: 'project-1',
  retryCount: 0,
  reviewItemId: 'review-item-1',
  scheduledTargets: [],
  status: TurboProjectItemStatus.READY,
} as ITurboProjectItem;

function renderCard(onReview = vi.fn()) {
  render(
    <TurboProjectItemCard
      item={readyItem}
      isDraft={false}
      disabled={false}
      onRemove={vi.fn()}
      onRetry={vi.fn()}
      onCaption={vi.fn()}
      onReview={onReview}
    />,
  );
  return onReview;
}

describe('TurboProjectItemCard rejection', () => {
  it('asks why before rejecting and sends the reason with the decision', () => {
    const onReview = renderCard();

    fireEvent.click(screen.getByRole('button', { name: 'Reject' }));
    expect(onReview).not.toHaveBeenCalled();

    fireEvent.change(
      screen.getByRole('textbox', {
        name: 'Why are you rejecting this? (optional)',
      }),
      { target: { value: '  Too salesy  ' } },
    );
    fireEvent.click(screen.getByRole('button', { name: 'Reject draft' }));

    expect(onReview).toHaveBeenCalledWith('rejected', 'Too salesy');
  });

  it('rejects without a reason when none is typed', () => {
    const onReview = renderCard();

    fireEvent.click(screen.getByRole('button', { name: 'Reject' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reject draft' }));

    expect(onReview).toHaveBeenCalledWith('rejected', undefined);
  });

  it('cancels without reviewing', () => {
    const onReview = renderCard();

    fireEvent.click(screen.getByRole('button', { name: 'Reject' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onReview).not.toHaveBeenCalled();
    expect(
      screen.queryByRole('button', { name: 'Reject draft' }),
    ).not.toBeInTheDocument();
  });
});
