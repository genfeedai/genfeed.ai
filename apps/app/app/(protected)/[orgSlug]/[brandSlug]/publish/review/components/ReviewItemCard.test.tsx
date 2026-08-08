import { BatchItemStatus, ContentFormat } from '@genfeedai/enums';
import { render, screen } from '@testing-library/react';
import ReviewItemCard from './ReviewItemCard';
import '@testing-library/jest-dom/vitest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@helpers/formatting/timezone/timezone.helper', () => ({
  formatDateInTimezone: () => 'Mar 10',
  getBrowserTimezone: () => 'UTC',
}));

vi.mock('next/image', () => ({
  default: ({ alt, src }: { alt: string; src: string }) => (
    <div data-alt={alt} data-src={src} />
  ),
}));

const baseItem = {
  batchId: 'batch-1',
  caption: 'Ship the new launch clip',
  createdAt: '2026-03-10T10:00:00.000Z',
  format: ContentFormat.VIDEO,
  id: 'item-1',
  platform: 'instagram',
  status: BatchItemStatus.COMPLETED,
};

describe('ReviewItemCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the review card content', () => {
    render(
      <ReviewItemCard
        isActive={false}
        isSelected={false}
        item={baseItem}
        onSelect={vi.fn()}
        onToggleSelect={vi.fn()}
      />,
    );

    expect(screen.getByText('Ship the new launch clip')).toBeInTheDocument();
    expect(screen.queryByText('Prompt ready')).not.toBeInTheDocument();
  });

  it('shows performance signals when analytics exist', () => {
    render(
      <ReviewItemCard
        isActive={false}
        isSelected={false}
        item={{
          ...baseItem,
          postAvgEngagementRate: 7.4,
          postStatus: 'public',
          postTotalViews: 5400,
        }}
        onSelect={vi.fn()}
        onToggleSelect={vi.fn()}
      />,
    );

    expect(screen.getByText('Winning')).toBeInTheDocument();
    // #2485 polish: the raw view/engagement spans were folded into the
    // signal chip — the numbers no longer render inline on the card.
    expect(screen.queryByText('5,400 views')).not.toBeInTheDocument();
  });

  it('renders the compact selection control from the #2485 polish', () => {
    render(
      <ReviewItemCard
        isActive={false}
        isSelected={false}
        item={baseItem}
        onSelect={vi.fn()}
        onToggleSelect={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'Select item' })).toHaveClass(
      'size-7',
      'shrink-0',
    );
  });
});
