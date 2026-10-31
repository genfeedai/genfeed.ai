import type { IReviewInboxItem } from '@genfeedai/contracts/interfaces';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ReviewInboxApprovalsState } from '@/props/publishing/review-inbox-approvals.props';
import ReviewInboxApprovalsSection from './ReviewInboxApprovalsSection';

const confirmMocks = vi.hoisted(() => ({ openConfirm: vi.fn() }));

vi.mock(
  '@genfeedai/contexts/providers/global-modals/global-modals.hooks',
  () => ({
    useConfirmModal: () => ({ openConfirm: confirmMocks.openConfirm }),
  }),
);

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return {
    useTranslations: (namespace: string) => translateFromCatalog(namespace),
  };
});

const approval: IReviewInboxItem = {
  actionDetails: 'Platform: instagram',
  actionSummary: 'Publish post · Platform: instagram',
  actionTitle: 'Publish post',
  approvalId: 'apr-1',
  brandId: 'brand-1',
  brandLabel: 'Acme',
  brandLogoUrl: null,
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
  requestedByLabel: 'Vincent',
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
    isBulkDeciding: false,
    isHighlightedItemMissing: false,
    isLoading: false,
    items: [approval],
    onDecide: vi.fn().mockResolvedValue(undefined),
    onDecideMany: vi.fn().mockResolvedValue(undefined),
    onSourceFilterChange: vi.fn(),
    refresh: vi.fn(),
    sourceFilters: [],
    ...overrides,
  };
}

describe('ReviewInboxApprovalsSection', () => {
  it('shows what will happen, for which brand, at what cost and who asked', () => {
    render(<ReviewInboxApprovalsSection approvals={state()} />);

    expect(screen.queryByText('Waiting on you')).not.toBeInTheDocument();
    expect(
      screen.queryByText(/Workflow review gates and MCP client requests/),
    ).not.toBeInTheDocument();
    expect(screen.getByText('MCP client')).toBeInTheDocument();
    expect(screen.getByText('Acme')).toBeInTheDocument();
    expect(screen.getByText('Publish post')).toBeInTheDocument();
    expect(screen.getByText('Platform: instagram')).toBeInTheDocument();
    expect(screen.getByText('By Vincent')).toBeInTheDocument();
    expect(screen.getByText('Hello world')).toBeInTheDocument();
    expect(screen.getByText('4 credits')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Approve' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reject' })).toBeInTheDocument();
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
    expect(screen.getByText('Publish post')).toBeVisible();
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
      actionTitle: `Request ${index + 1}`,
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
      actionTitle: `Request ${index + 1}`,
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

  it('shows a request with no quoted cost and no requester plainly', () => {
    render(
      <ReviewInboxApprovalsSection
        approvals={state({
          items: [
            {
              ...approval,
              brandId: null,
              brandLabel: null,
              estimatedCredits: null,
              requestedByLabel: null,
            },
          ],
        })}
      />,
    );

    expect(screen.getByText('All brands')).toBeInTheDocument();
    expect(screen.getByText('No charge quoted')).toBeInTheDocument();
    expect(screen.queryByText(/^By /)).not.toBeInTheDocument();
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
    expect(
      screen.getByText('Only an admin can decide this'),
    ).toBeInTheDocument();
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
  describe('bulk decisions', () => {
    const second: IReviewInboxItem = {
      ...approval,
      estimatedCredits: 6,
      id: 'mcp_approval:apr-2',
    };

    it('rejects every request after Select all, once confirmed', async () => {
      const approvals = state({ items: [approval, second] });
      confirmMocks.openConfirm.mockClear();
      render(<ReviewInboxApprovalsSection approvals={approvals} />);

      fireEvent.click((await screen.findAllByRole('checkbox'))[1]);
      expect(screen.getByText('selected')).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Select all 2' }));
      fireEvent.click(screen.getAllByRole('button', { name: 'Reject' })[0]);

      expect(confirmMocks.openConfirm).toHaveBeenCalledTimes(1);
      const config = confirmMocks.openConfirm.mock.calls[0][0];
      expect(config.label).toBe('Reject 2 requests?');
      await config.onConfirm();
      expect(approvals.onDecideMany).toHaveBeenCalledWith(
        [approval, second],
        'reject',
      );
    });

    it('states the total credits before approving a selection', async () => {
      confirmMocks.openConfirm.mockClear();
      render(
        <ReviewInboxApprovalsSection
          approvals={state({ items: [approval, second] })}
        />,
      );

      fireEvent.click((await screen.findAllByRole('checkbox'))[0]);
      fireEvent.click(screen.getAllByRole('button', { name: 'Approve' })[0]);

      expect(confirmMocks.openConfirm.mock.calls[0][0].message).toContain(
        '10 credits',
      );
    });

    it('never selects a request nobody can decide', async () => {
      const locked: IReviewInboxItem = {
        ...approval,
        id: 'mcp_approval:apr-3',
        isResolvable: false,
      };
      render(
        <ReviewInboxApprovalsSection approvals={state({ items: [locked] })} />,
      );

      fireEvent.click((await screen.findAllByRole('checkbox'))[0]);

      expect(screen.queryByText('selected')).not.toBeInTheDocument();
    });
  });
});
