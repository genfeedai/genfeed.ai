import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import PublishingContentStatus from '@/features/posts/library/publishing-content-status';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

vi.mock(
  '@/features/posts/hooks/use-publishing-content-time/use-publishing-content-time',
  () => ({ usePublishingContentTime: () => null }),
);

describe('PublishingContentStatus', () => {
  it('shows Delivered instead of the stored status', () => {
    render(<PublishingContentStatus isInboxDelivery status="published" />);

    expect(screen.getByText('Delivered')).toBeInTheDocument();
    expect(screen.queryByText('Published')).not.toBeInTheDocument();
  });

  it('shows the status for a post that is live', () => {
    render(<PublishingContentStatus status="published" />);

    expect(screen.getByText('Published')).toBeInTheDocument();
  });
});
