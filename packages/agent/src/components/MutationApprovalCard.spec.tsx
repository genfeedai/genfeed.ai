import { MutationApprovalCard } from '@genfeedai/agent/components/MutationApprovalCard';
import type { AgentUiAction } from '@genfeedai/agent/models/agent-chat.model';
import { useAgentChatStore } from '@genfeedai/agent/stores/agent-chat.store';
import { getAgentUiActionSourceId } from '@genfeedai/contracts/interfaces';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

beforeEach(() => {
  useAgentChatStore.setState(useAgentChatStore.getInitialState(), true);
});

/**
 * The container's handler on an ack: it tracks the run the action started on
 * the visible thread as pending and reports `'pending'`.
 */
function acceptingUiAction() {
  useAgentChatStore.setState({ activeThreadId: 'thread-1' });
  return vi.fn(async (action: string, payload?: Record<string, unknown>) => {
    useAgentChatStore.getState().trackUiActionRun('thread-1', {
      action,
      runId: `exec-${action}`,
      sourceId: getAgentUiActionSourceId(payload),
    });
    return 'pending' as const;
  });
}

function approval(status = 'pending'): AgentUiAction {
  return {
    id: 'card-1',
    type: 'mutation_approval_card',
    data: {
      approvalId: 'approval-1',
      sourceActionId: 'source-1',
      summary: 'Delete the Summer launch draft?',
      items: [{ label: 'Draft', value: 'Summer launch' }],
      status,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    },
    ctas: [
      {
        action: 'confirm_mutation',
        label: 'Approve',
        payload: { args: { deleteEverything: true } },
      },
    ],
  };
}

describe('MutationApprovalCard', () => {
  it('shows prepared details and sends only server references, locking duplicate responses', async () => {
    let finish: ((value: boolean) => void) | undefined;
    const onUiAction = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          finish = resolve;
        }),
    );
    render(
      <MutationApprovalCard action={approval()} onUiAction={onUiAction} />,
    );
    expect(screen.getByText('Summer launch')).toBeInTheDocument();
    const approve = screen.getByRole('button', { name: 'Approve' });
    fireEvent.click(approve);
    fireEvent.click(approve);
    expect(screen.getByRole('button', { name: 'Decline' })).toBeDisabled();
    expect(onUiAction).toHaveBeenCalledTimes(1);
    expect(onUiAction).toHaveBeenCalledWith('confirm_mutation', {
      approvalId: 'approval-1',
      sourceActionId: 'source-1',
    });
    await act(async () => finish?.(true));
    expect(screen.getByRole('status')).toHaveTextContent('Approved');
    expect(screen.queryByRole('button')).toBeNull();
  });

  it.each([false, undefined])(
    'does not treat %s as acceptance and allows retry',
    async (outcome) => {
      const onUiAction = vi
        .fn()
        .mockResolvedValueOnce(outcome)
        .mockResolvedValueOnce(true);
      render(
        <MutationApprovalCard action={approval()} onUiAction={onUiAction} />,
      );
      fireEvent.click(screen.getByRole('button', { name: 'Decline' }));
      await waitFor(() =>
        expect(screen.getByRole('alert')).toHaveTextContent('Try again'),
      );
      fireEvent.click(screen.getByRole('button', { name: 'Decline' }));
      await waitFor(() =>
        expect(screen.getByRole('status')).toHaveTextContent('Declined'),
      );
      expect(onUiAction).toHaveBeenLastCalledWith('decline_mutation', {
        approvalId: 'approval-1',
        sourceActionId: 'source-1',
      });
    },
  );

  it('stays locked without an error while the accepted decision runs', async () => {
    const onUiAction = acceptingUiAction();
    render(
      <MutationApprovalCard action={approval()} onUiAction={onUiAction} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    await act(async () => {
      await onUiAction.mock.results[0]?.value;
    });
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
    const decline = screen.getByRole('button', { name: 'Decline' });
    expect(decline).toBeDisabled();
    fireEvent.click(decline);
    expect(onUiAction).toHaveBeenCalledTimes(1);
  });

  it('shows a retryable error when the callback rejects', async () => {
    render(
      <MutationApprovalCard
        action={approval()}
        onUiAction={vi.fn().mockRejectedValue(new Error('offline'))}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Approve' })).toBeEnabled();
  });

  it.each(['approved', 'declined'])(
    'renders persisted %s state without controls',
    (status) => {
      render(
        <MutationApprovalCard action={approval(status)} onUiAction={vi.fn()} />,
      );
      expect(screen.getByRole('status')).toHaveTextContent(
        new RegExp(status, 'i'),
      );
      expect(screen.queryByRole('button')).toBeNull();
    },
  );

  it('keeps a consumed approval resolved when execution fails', () => {
    const action = approval('approved');
    action.data = { ...action.data, executionStatus: 'failed' };
    render(<MutationApprovalCard action={action} onUiAction={vi.fn()} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Action failed');
    expect(screen.getByRole('alert')).toHaveTextContent(
      'could not be completed',
    );
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Decline' })).toBeNull();
    expect(
      screen.getByRole('button', { name: 'Review changes' }),
    ).toBeEnabled();
  });

  it('honors a live server resolution', () => {
    const { rerender } = render(
      <MutationApprovalCard action={approval()} onUiAction={vi.fn()} />,
    );
    rerender(
      <MutationApprovalCard
        action={approval('declined')}
        onUiAction={vi.fn()}
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent('Declined');
    expect(screen.queryByRole('button')).toBeNull();
  });

  it.each([
    undefined,
    {},
    { ...approval().data, summary: '' },
    { ...approval().data, status: 'unknown' },
    { ...approval().data, status: 1 },
    { ...approval().data, status: { toString: () => 'pending' } },
    { ...approval().data, items: [{ label: 'Draft' }] },
  ])('fails closed for malformed data %j', (data) => {
    render(
      <MutationApprovalCard
        action={{ ...approval(), data }}
        onUiAction={vi.fn()}
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent('unavailable');
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('disables controls without a dispatch callback', () => {
    render(<MutationApprovalCard action={approval()} />);
    expect(screen.getByRole('button', { name: 'Approve' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Decline' })).toBeDisabled();
  });
});

describe('contextual approval recovery', () => {
  it('replaces consent buttons at the exact one-hour boundary without a reload', () => {
    vi.useFakeTimers();
    try {
      render(<MutationApprovalCard action={approval()} onUiAction={vi.fn()} />);
      act(() => vi.advanceTimersByTime(60 * 60 * 1000 - 1));
      expect(screen.getByRole('button', { name: 'Approve' })).toBeEnabled();
      act(() => vi.advanceTimersByTime(1));
      expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Decline' })).toBeNull();
      expect(screen.getByRole('status')).toHaveTextContent('Approval expired');
      expect(
        screen.getByRole('button', { name: 'Prepare again' }),
      ).toBeEnabled();
    } finally {
      vi.useRealTimers();
    }
  });
  it.each([undefined, 'invalid', new Date(0).toISOString()])(
    'fails closed for deadline %s',
    (expiresAt) => {
      const action = approval();
      action.data = { ...action.data, expiresAt };
      render(<MutationApprovalCard action={action} onUiAction={vi.fn()} />);
      expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull();
      expect(
        screen.getByRole('button', { name: 'Prepare again' }),
      ).toBeEnabled();
    },
  );
  it('checks wall time before a stale click even if its timer has not fired', () => {
    vi.useFakeTimers();
    try {
      const onUiAction = vi.fn();
      render(
        <MutationApprovalCard action={approval()} onUiAction={onUiAction} />,
      );
      const approve = screen.getByRole('button', { name: 'Approve' });
      vi.setSystemTime(Date.now() + 60 * 60 * 1000);
      fireEvent.click(approve);
      expect(onUiAction).not.toHaveBeenCalled();
      expect(
        screen.getByRole('button', { name: 'Prepare again' }),
      ).toBeEnabled();
    } finally {
      vi.useRealTimers();
    }
  });
  it('reconciles delayed expiry when a background tab becomes visible', () => {
    vi.useFakeTimers();
    try {
      render(<MutationApprovalCard action={approval()} onUiAction={vi.fn()} />);
      vi.setSystemTime(Date.now() + 60 * 60 * 1000);
      fireEvent(document, new Event('visibilitychange'));
      expect(
        screen.getByRole('button', { name: 'Prepare again' }),
      ).toBeEnabled();
    } finally {
      vi.useRealTimers();
    }
  });
  it('does not rearm an already accepted decision when its deadline passes', async () => {
    vi.useFakeTimers();
    try {
      render(
        <MutationApprovalCard
          action={approval()}
          onUiAction={acceptingUiAction()}
        />,
      );
      await act(async () =>
        fireEvent.click(screen.getByRole('button', { name: 'Approve' })),
      );
      act(() => vi.advanceTimersByTime(60 * 60 * 1000));
      expect(screen.getByRole('button', { name: 'Approve' })).toBeDisabled();
      expect(
        screen.queryByRole('button', { name: 'Prepare again' }),
      ).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
  it('prepares only once and requires a new approval after the replacement arrives', async () => {
    const action = approval();
    action.data = { ...action.data, expiresAt: new Date(0).toISOString() };
    const onUiAction = acceptingUiAction();
    const { rerender } = render(
      <MutationApprovalCard action={action} onUiAction={onUiAction} />,
    );
    const prepare = screen.getByRole('button', { name: 'Prepare again' });
    await act(async () => {
      fireEvent.click(prepare);
      fireEvent.click(prepare);
    });
    expect(onUiAction).toHaveBeenCalledTimes(1);
    expect(onUiAction).toHaveBeenCalledWith('reprepare_mutation', {
      approvalId: 'approval-1',
      sourceActionId: 'source-1',
    });
    expect(
      screen.getByRole('button', { name: 'Prepare again' }),
    ).toBeDisabled();
    const fresh = approval();
    fresh.data = {
      ...fresh.data,
      approvalId: 'approval-2',
      sourceActionId: 'source-2',
    };
    rerender(<MutationApprovalCard action={fresh} onUiAction={onUiAction} />);
    expect(screen.queryByRole('button', { name: 'Prepare again' })).toBeNull();
    await act(async () =>
      fireEvent.click(screen.getByRole('button', { name: 'Approve' })),
    );
    expect(onUiAction).toHaveBeenLastCalledWith('confirm_mutation', {
      approvalId: 'approval-2',
      sourceActionId: 'source-2',
    });
  });
  it('keeps expiry recoverable after preparation fails', async () => {
    const action = approval();
    action.data = { ...action.data, expiresAt: new Date(0).toISOString() };
    const onUiAction = vi.fn().mockResolvedValue(false);
    render(<MutationApprovalCard action={action} onUiAction={onUiAction} />);
    fireEvent.click(screen.getByRole('button', { name: 'Prepare again' }));
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(
        'could not be prepared',
      ),
    );
    expect(screen.getByRole('button', { name: 'Prepare again' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull();
  });
  it('collapses scrubbed failure details and requests review without executing the consumed approval', async () => {
    const action = approval('approved');
    action.data = {
      ...action.data,
      executionStatus: 'failed',
      error: 'Dispatch failed api_key=sk-secret-value',
    };
    const onUiAction = vi.fn().mockResolvedValue(true);
    render(<MutationApprovalCard action={action} onUiAction={onUiAction} />);
    const details = screen.getByRole('button', { name: 'Technical details' });
    expect(details).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText(/Dispatch failed/)).toBeNull();
    fireEvent.click(details);
    expect(details).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText(/Dispatch failed/)).not.toHaveTextContent(
      'sk-secret-value',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Review changes' }));
    await waitFor(() =>
      expect(screen.getByText('Review requested')).toBeInTheDocument(),
    );
    expect(onUiAction).toHaveBeenCalledWith(
      'send_prompt',
      expect.objectContaining({
        sourceActionId: 'source-1',
        prompt: expect.stringContaining('partial changes'),
      }),
    );
    expect(onUiAction).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull();
  });
});
