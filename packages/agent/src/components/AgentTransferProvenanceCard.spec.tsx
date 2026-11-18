import {
  type AgentHandoffActions,
  AgentHandoffProvider,
} from '@genfeedai/agent/components/AgentHandoffContext';
import { AgentThreadOpenProvider } from '@genfeedai/agent/components/AgentThreadOpenContext';
import {
  type AgentThreadResolution,
  AgentThreadResolutionProvider,
} from '@genfeedai/agent/components/AgentThreadResolutionContext';
import { AgentTransferProvenanceCard } from '@genfeedai/agent/components/AgentTransferProvenanceCard';
import type { AgentUiActionOf } from '@genfeedai/agent/models/agent-chat.model';
import {
  AgentTransferDeliveryMode,
  AgentTransferStatus,
} from '@genfeedai/contracts';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

function makeAction(
  overrides: Record<string, unknown> = {},
): AgentUiActionOf<'agent_transfer_card'> {
  return {
    data: {
      transfer: {
        completedAt: null,
        completionSummary: null,
        content: 'Use the approved analytics snapshot and draft three hooks.',
        createdAt: '2026-08-26T12:00:00.000Z',
        deliveryMode: AgentTransferDeliveryMode.SEND_AND_RUN,
        destinationExecutionId: 'run-1',
        destinationThreadId: 'destination-1',
        destinationThreadTitle: 'Hook specialist',
        direction: 'outbound',
        failureReason: null,
        id: 'transfer-1',
        progress: 42,
        retryCount: 0,
        sourceThreadId: 'source-1',
        sourceThreadTitle: 'Analytics',
        status: AgentTransferStatus.RUNNING,
        ...overrides,
      },
    },
    id: 'action-1',
    title: 'Conversation transfer',
    type: 'agent_transfer_card',
  };
}

describe('AgentTransferProvenanceCard', () => {
  it('renders an accessible live status and expands transfer provenance', () => {
    render(<AgentTransferProvenanceCard action={makeAction()} />);

    expect(screen.getByRole('status')).toHaveTextContent('running');
    fireEvent.click(
      screen.getByRole('button', { name: 'Expand transfer details' }),
    );
    expect(
      screen.getByText(
        'Use the approved analytics snapshot and draft three hooks.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Open conversation' }),
    ).toHaveAttribute('href', '/agent/destination-1');
  });

  it('copies bounded context and exposes the failure reason', async () => {
    const onCopy = vi.fn().mockResolvedValue(undefined);
    render(
      <AgentTransferProvenanceCard
        action={makeAction({
          failureReason: 'Destination queue unavailable.',
          status: AgentTransferStatus.FAILED,
        })}
        onCopy={onCopy}
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Destination queue unavailable.',
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Copy transferred context' }),
    );
    expect(onCopy).toHaveBeenCalledWith(
      'Use the approved analytics snapshot and draft three hooks.',
    );
  });

  it('dispatches explicit send-and-run confirmation from a pending card', () => {
    const onUiAction = vi.fn();
    const action: AgentUiActionOf<'agent_transfer_card'> = {
      ctas: [
        {
          action: 'confirm_agent_transfer',
          label: 'Send and run',
          payload: { sourceActionId: 'agent-transfer:key-1' },
        },
      ],
      data: {
        content: 'Handoff context',
        direction: 'outbound',
        status: 'PENDING',
      },
      id: 'agent-transfer:key-1',
      title: 'Send to specialist and run',
      type: 'agent_transfer_card',
    };

    render(
      <AgentTransferProvenanceCard action={action} onUiAction={onUiAction} />,
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Expand transfer details' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Send and run' }));
    expect(onUiAction).toHaveBeenCalledWith('confirm_agent_transfer', {
      sourceActionId: 'agent-transfer:key-1',
    });
  });

  it('opens the destination thread in the Threads panel when the surface has one', () => {
    const onOpenThread = vi.fn();
    render(
      <AgentThreadOpenProvider value={onOpenThread}>
        <AgentTransferProvenanceCard action={makeAction()} />
      </AgentThreadOpenProvider>,
    );

    fireEvent.click(screen.getByTestId('agent-transfer-open-thread'));

    expect(onOpenThread).toHaveBeenCalledWith('destination-1');
  });

  it('has no panel button where no surface offers one', () => {
    render(<AgentTransferProvenanceCard action={makeAction()} />);

    expect(screen.queryByTestId('agent-transfer-open-thread')).toBeNull();
  });

  describe('resolving the thread it sent work to', () => {
    function makeResolution(
      overrides: Partial<AgentThreadResolution> = {},
    ): AgentThreadResolution {
      return {
        isPending: () => false,
        isResolved: () => false,
        reopenThread: vi.fn(),
        resolveThread: vi.fn(),
        ...overrides,
      };
    }

    it('resolves the destination thread from the card', () => {
      const resolution = makeResolution();
      render(
        <AgentThreadResolutionProvider value={resolution}>
          <AgentTransferProvenanceCard action={makeAction()} />
        </AgentThreadResolutionProvider>,
      );

      fireEvent.click(screen.getByRole('button', { name: 'Resolve' }));

      expect(resolution.resolveThread).toHaveBeenCalledWith('destination-1');
      expect(screen.queryByTestId('agent-transfer-resolved')).toBeNull();
    });

    it('shows a resolved thread as resolved and offers to reopen it', () => {
      const resolution = makeResolution({
        isResolved: (threadId) => threadId === 'destination-1',
      });
      render(
        <AgentThreadResolutionProvider value={resolution}>
          <AgentTransferProvenanceCard action={makeAction()} />
        </AgentThreadResolutionProvider>,
      );

      expect(screen.getByTestId('agent-transfer-resolved')).toHaveTextContent(
        'Resolved',
      );
      fireEvent.click(screen.getByRole('button', { name: 'Reopen' }));

      expect(resolution.reopenThread).toHaveBeenCalledWith('destination-1');
    });

    it('disables the action while the change is in flight', () => {
      render(
        <AgentThreadResolutionProvider
          value={makeResolution({ isPending: () => true })}
        >
          <AgentTransferProvenanceCard action={makeAction()} />
        </AgentThreadResolutionProvider>,
      );

      expect(screen.getByRole('button', { name: 'Resolve' })).toBeDisabled();
    });

    it('offers nothing on a card received from another thread', () => {
      render(
        <AgentThreadResolutionProvider value={makeResolution()}>
          <AgentTransferProvenanceCard
            action={makeAction({ direction: 'inbound' })}
          />
        </AgentThreadResolutionProvider>,
      );

      expect(screen.queryByRole('button', { name: 'Resolve' })).toBeNull();
    });

    it('offers nothing where the surface keeps no resolved state', () => {
      render(<AgentTransferProvenanceCard action={makeAction()} />);

      expect(screen.queryByRole('button', { name: 'Resolve' })).toBeNull();
    });
  });
  describe('a hand-off to a teammate (#9940)', () => {
    const handoff = (overrides: Record<string, unknown> = {}) =>
      makeAction({
        destinationUserId: 'marco',
        status: AgentTransferStatus.AWAITING_ACCEPTANCE,
        userId: 'ana',
        ...overrides,
      });
    const directory = (
      overrides: Partial<AgentHandoffActions> = {},
    ): AgentHandoffActions => ({
      accept: vi
        .fn()
        .mockResolvedValue({ status: AgentTransferStatus.PENDING }),
      decline: vi
        .fn()
        .mockResolvedValue({ status: AgentTransferStatus.DECLINED }),
      nameOf: (userId) => ({ ana: 'Ana Costa', marco: 'Marco Rossi' })[userId],
      ...overrides,
    });

    it('asks the teammate to accept or decline, and runs only after accept', async () => {
      const actions = directory();
      render(
        <AgentHandoffProvider value={actions}>
          <AgentTransferProvenanceCard
            action={handoff({ direction: 'inbound' })}
          />
        </AgentHandoffProvider>,
      );

      expect(
        screen.getByText('Ana Costa handed this to your agent'),
      ).toBeInTheDocument();
      expect(
        screen.getByText('It runs with your permissions once you accept.'),
      ).toBeInTheDocument();
      // The sender's conversation is not the teammate's to open.
      expect(
        screen.queryByRole('link', { name: 'Open conversation' }),
      ).toBeNull();

      fireEvent.click(screen.getByRole('button', { name: 'Accept' }));

      await waitFor(() =>
        expect(
          screen.getByText('Accepted. Your agent is on it.'),
        ).toBeInTheDocument(),
      );
      expect(actions.accept).toHaveBeenCalledWith('transfer-1');
      expect(actions.decline).not.toHaveBeenCalled();
      expect(screen.queryByRole('button', { name: 'Accept' })).toBeNull();
    });

    it('lets the teammate decline and says the sender was told', async () => {
      const actions = directory();
      render(
        <AgentHandoffProvider value={actions}>
          <AgentTransferProvenanceCard
            action={handoff({ direction: 'inbound' })}
          />
        </AgentHandoffProvider>,
      );

      fireEvent.click(screen.getByRole('button', { name: 'Decline' }));

      await waitFor(() =>
        expect(
          screen.getByText('Declined. Ana Costa was told.'),
        ).toBeInTheDocument(),
      );
      expect(actions.accept).not.toHaveBeenCalled();
    });

    it('shows a failed answer and keeps the request open', async () => {
      render(
        <AgentHandoffProvider
          value={directory({
            accept: vi.fn().mockRejectedValue(new Error('Already answered.')),
          })}
        >
          <AgentTransferProvenanceCard
            action={handoff({ direction: 'inbound' })}
          />
        </AgentHandoffProvider>,
      );

      fireEvent.click(screen.getByRole('button', { name: 'Accept' }));

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Already answered.',
      );
      expect(screen.getByRole('button', { name: 'Accept' })).toBeEnabled();
    });

    it('tells the sender it waits on the teammate and links nothing it cannot open', () => {
      render(
        <AgentHandoffProvider value={directory()}>
          <AgentTransferProvenanceCard
            action={handoff({ direction: 'outbound' })}
          />
        </AgentHandoffProvider>,
      );

      fireEvent.click(
        screen.getByRole('button', { name: 'Expand transfer details' }),
      );
      expect(screen.getByText('Handed to Marco Rossi')).toBeInTheDocument();
      expect(
        screen.getByText('Waiting for Marco Rossi to accept.'),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole('link', { name: 'Open conversation' }),
      ).toBeNull();
      expect(screen.queryByRole('button', { name: 'Accept' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
    });

    it('does not offer a failed hand-off retry to its sender', () => {
      render(
        <AgentHandoffProvider value={directory()}>
          <AgentTransferProvenanceCard
            action={handoff({
              direction: 'outbound',
              status: AgentTransferStatus.FAILED,
            })}
          />
        </AgentHandoffProvider>,
      );

      expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
    });

    it('offers no answer where the surface cannot send one', () => {
      render(
        <AgentTransferProvenanceCard
          action={handoff({ direction: 'inbound' })}
        />,
      );

      expect(screen.getByRole('button', { name: 'Accept' })).toBeDisabled();
      expect(
        screen.getByText('a teammate handed this to your agent'),
      ).toBeInTheDocument();
    });
  });
});
