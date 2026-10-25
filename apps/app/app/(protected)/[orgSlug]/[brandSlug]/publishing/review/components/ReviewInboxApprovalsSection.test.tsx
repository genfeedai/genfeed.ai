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

    expect(screen.queryByText('Waiting on you')).not.toBeInTheDocument();
    expect(
      screen.queryByText(/Workflow review gates and MCP client requests/),
    ).not.toBeInTheDocument();
    expect(screen.getByText('MCP client')).toBeInTheDocument();
    expect(screen.getByText('Acme')).toBeInTheDocument();
    expect(
      screen.getByText('Publish post · Platform: instagram'),
    ).toBeInTheDocument();
    expect(screen.getByText('Hello world')).toBeInTheDocument();
    expect(screen.getByText('Pending')).toBeInTheDocument();
    expect(screen.getByText('4 credits')).toBeInTheDocument();
  });

  it('heads the requests as a Needs you section only when given a title', () => {
    const { rerender } = render(
      <ReviewInboxApprovalsSection approvals={state()} />,
    );

    expect(
      screen.queryByRole('heading', { name: 'Needs you' }),
    ).not.toBeInTheDocument();

    rerender(
      <ReviewInboxApprovalsSection approvals={state()} title="Needs you" />,
    );

    expect(
      screen.getByRole('heading', { name: 'Needs you' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Publish post · Platform: instagram'),
    ).toBeVisible();
  });

  it('previews the post caption and image on the row', () => {
    render(
      <ReviewInboxApprovalsSection
        approvals={state({
          items: [
            {
              ...approval,
              preview: {
                caption: 'Ship the post',
                mediaUrl: 'https://cdn.example.com/post.jpg',
              },
            },
          ],
        })}
      />,
    );

    expect(screen.getByText('Ship the post')).toBeInTheDocument();
    expect(
      screen.getByRole('img', {
        name: 'Preview of the media this request would use',
      }),
    ).toHaveAttribute('src', 'https://cdn.example.com/post.jpg');
  });

  it('says so when a request has nothing to preview', () => {
    render(
      <ReviewInboxApprovalsSection
        approvals={state({
          items: [{ ...approval, preview: { caption: null, mediaUrl: null } }],
        })}
      />,
    );

    expect(screen.getByText('No preview')).toBeInTheDocument();
  });

  it('paginates the approvals ten at a time', () => {
    const items = Array.from({ length: 12 }, (_, index) => ({
      ...approval,
      actionSummary: `Request ${index + 1}`,
      id: `mcp_approval:apr-${index + 1}`,
    }));
    render(<ReviewInboxApprovalsSection approvals={state({ items })} />);

    expect(screen.getByText('Request 1')).toBeInTheDocument();
    expect(screen.getByText('Request 10')).toBeInTheDocument();
    expect(screen.queryByText('Request 11')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('link', { name: '2' }));

    expect(screen.getByText('Request 11')).toBeInTheDocument();
    expect(screen.getByText('Request 12')).toBeInTheDocument();
    expect(screen.queryByText('Request 1')).not.toBeInTheDocument();
  });

  it('opens on the page holding a deep-linked approval', () => {
    const items = Array.from({ length: 12 }, (_, index) => ({
      ...approval,
      actionSummary: `Request ${index + 1}`,
      id: `mcp_approval:apr-${index + 1}`,
    }));
    render(
      <ReviewInboxApprovalsSection
        approvals={state({
          highlightedItemId: 'mcp_approval:apr-12',
          items,
        })}
      />,
    );

    expect(screen.getByText('Request 12')).toBeInTheDocument();
    expect(screen.queryByText('Request 1')).not.toBeInTheDocument();
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
