import { BatchItemStatus, ContentFormat } from '@genfeedai/contracts';
import type { IBatchItem } from '@genfeedai/contracts/interfaces';
import { render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';

type MockImageProps = ComponentProps<'img'> & {
  fill?: boolean;
  priority?: boolean;
  unoptimized?: boolean;
};

vi.mock('next/image', () => ({
  default: ({
    fill: _fill,
    priority: _priority,
    unoptimized: _unoptimized,
    ...props
  }: MockImageProps) => <img {...props} alt={props.alt ?? ''} />,
}));

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import(
    '../../../../../../../tests/next-intl.stub'
  );
  return { useTranslations: translateFromCatalog };
});

vi.mock('./ReviewDetailPanelAside', () => ({
  default: function MockReviewDetailPanelAside() {
    return <div data-testid="review-detail-panel-aside" />;
  },
}));

vi.mock('./ReviewDetailPanelHeader', () => ({
  default: function MockReviewDetailPanelHeader() {
    return <div data-testid="review-detail-panel-header" />;
  },
}));

import ReviewDetailPanel from './ReviewDetailPanel';

const baseItem: IBatchItem = {
  batchId: 'batch-1',
  caption: 'Ship the review rail',
  createdAt: '2026-03-10T10:00:00.000Z',
  format: ContentFormat.IMAGE,
  id: 'item-1',
  platform: 'twitter',
  status: BatchItemStatus.COMPLETED,
};

function renderPanel(item: IBatchItem) {
  return render(
    <ReviewDetailPanel
      isActioning={false}
      isSelected={false}
      item={item}
      onApprove={vi.fn()}
      onAssign={vi.fn()}
      onReject={vi.fn()}
      onRequestChanges={vi.fn()}
      onToggleSelect={vi.fn()}
      onUnassign={vi.fn()}
    />,
  );
}

describe('ReviewDetailPanel', () => {
  it('renders the platform-tuned preview for the item under review', () => {
    renderPanel({
      ...baseItem,
      mediaUrl: 'https://cdn.example.com/media.jpg',
    });

    expect(screen.getByText('Preview')).toBeInTheDocument();
    expect(
      screen.getByLabelText('twitter platform preview'),
    ).toBeInTheDocument();
    expect(screen.getByText('Ship the review rail')).toBeInTheDocument();
    expect(screen.getByTestId('preview-media')).toBeInTheDocument();
  });

  it('skips the platform renderer when no platform is stored', () => {
    renderPanel({
      ...baseItem,
      platform: undefined,
    });

    expect(screen.getByText('Preview')).toBeInTheDocument();
    expect(
      screen.queryByLabelText(/platform preview$/i),
    ).not.toBeInTheDocument();
    expect(screen.getByText('No media on this draft yet')).toBeInTheDocument();
  });
});
