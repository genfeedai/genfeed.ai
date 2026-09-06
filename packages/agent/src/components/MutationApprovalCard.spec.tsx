import { MutationApprovalCard } from '@genfeedai/agent/components/MutationApprovalCard';
import type { AgentUiAction } from '@genfeedai/agent/models/agent-chat.model';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

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
