import { BatchStatus } from '@genfeedai/enums';
import ReviewStatsHeader from '@pages/review/components/ReviewStatsHeader';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockBatch = {
  brandId: 'brand-1',
  completedCount: 10,
  contentMix: {
    carouselPercent: 10,
    imagePercent: 60,
    reelPercent: 10,
    storyPercent: 0,
    videoPercent: 20,
  },
  createdAt: '2026-03-09T10:00:00.000Z',
  failedCount: 3,
  id: 'batch-1',
  items: [],
  pendingCount: 5,
  platforms: ['instagram'],
  status: BatchStatus.COMPLETED,
  totalCount: 18,
};

describe('ReviewStatsHeader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render without crashing', () => {
    const { container } = render(
      <ReviewStatsHeader batch={mockBatch} isLoading={false} />,
    );

    expect(container.firstChild).toBeInTheDocument();
  });

  it('should display stats correctly', () => {
    render(<ReviewStatsHeader batch={mockBatch} isLoading={false} />);

    expect(screen.getByText('18 total')).toBeInTheDocument();
    expect(screen.getByText('10 completed')).toBeInTheDocument();
    expect(screen.getByText('3 failed')).toBeInTheDocument();
    expect(screen.getByText('5 pending')).toBeInTheDocument();
  });
});
