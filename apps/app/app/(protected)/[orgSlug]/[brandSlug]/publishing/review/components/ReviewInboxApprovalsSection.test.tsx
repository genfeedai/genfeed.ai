import type { IReviewInboxItem } from '@genfeedai/contracts/interfaces';
import type { ReviewInboxApprovalsState } from '@props/publishing/review-inbox-approvals.props';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ReviewInboxApprovalsSection from './ReviewInboxApprovalsSection';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return {
    useTranslations: (namespace: string) => translateFromCatalog(namespace),
  };
});

const approval: IReviewInboxItem = {
  actionSummary: 'Publish post · Platform: instagram',
  approvalId: 'apr-1',
  brandId: 'brand-1',
  brandLabel: 'Acme',
  estimatedCredits: 4,
  executionId: null,
  expiresAt: null,
  id: 'mcp_approval:apr-1',
  isResolvable: true,
  kind: 'mcp_approval',
  nodeId: null,
  preview: { caption: 'Hello world', mediaUrl: null },
  reasons: [],
  requestedAt: '2026-10-01T00:00:00.000Z',
  source: 'mcp_client',
  sourceLabel: 'publish_post',
  status: 'pending',
  toolName: 'publish_post',
  workflowId: null,
};

function state(
  overrides: Partial<ReviewInboxApprovalsState> = {},
): ReviewInboxApprovalsState {
  return {
    decidingItemId: null,
    error: null,
    highlightedItemId: null,
    isHighlightedItemMissing: false,
    isLoading: false,
    items: [approval],
    onDecide: vi.fn().mockResolvedValue(undefined),
    onSourceFilterChange: vi.fn(),
    refresh: vi.fn(),
    sourceFilters: [],
    ...overrides,
  };
}

describe('ReviewInboxApprovalsSection', () => {
  it('shows source, brand and what the request wants to do', () => {
    render(<ReviewInboxApprovalsSection approvals={state()} />);

    expect(screen.getByText('Waiting on you')).toBeInTheDocument();
    expect(screen.getByText('MCP client')).toBeInTheDocument();
    expect(screen.getByText('Acme')).toBeInTheDocument();
    expect(
      screen.getByText('Publish post · Platform: instagram'),
    ).toBeInTheDocument();
    expect(screen.getByText('Hello world')).toBeInTheDocument();
    expect(screen.getByText('Pending')).toBeInTheDocument();
    expect(screen.getByText('4 credits')).toBeInTheDocument();
  });

  it('approves and rejects through the row actions', () => {
    const approvals = state();
    render(<ReviewInboxApprovalsSection approvals={approvals} />);

    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reject' }));

    expect(approvals.onDecide).toHaveBeenNthCalledWith(1, approval, 'approve');
    expect(approvals.onDecide).toHaveBeenNthCalledWith(2, approval, 'reject');
  });

  it('hides row actions the viewer cannot take', () => {
    render(
      <ReviewInboxApprovalsSection
        approvals={state({ items: [{ ...approval, isResolvable: false }] })}
      />,
    );

    expect(
      screen.queryByRole('button', { name: 'Approve' }),
    ).not.toBeInTheDocument();
  });

  it('explains a deep link to a request that is no longer pending', () => {
    render(
      <ReviewInboxApprovalsSection
        approvals={state({ isHighlightedItemMissing: true, items: [] })}
      />,
    );

    expect(
      screen.getByText(
        'That request was already resolved, or it is not visible to you.',
      ),
    ).toBeInTheDocument();
  });

  it('renders nothing when there is nothing to decide', () => {
    const { container } = render(
      <ReviewInboxApprovalsSection approvals={state({ items: [] })} />,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
