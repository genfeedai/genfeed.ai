import { AgentThreadOpenProvider } from '@genfeedai/agent/components/AgentThreadOpenContext';
import {
  type AgentThreadResolution,
  AgentThreadResolutionProvider,
} from '@genfeedai/agent/components/AgentThreadResolutionContext';
import { AgentTransferProvenanceCard } from '@genfeedai/agent/components/AgentTransferProvenanceCard';
import type { AgentUiAction } from '@genfeedai/agent/models/agent-chat.model';
import {
  AgentTransferDeliveryMode,
  AgentTransferStatus,
} from '@genfeedai/contracts';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

function makeAction(overrides: Record<string, unknown> = {}): AgentUiAction {
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
    const action: AgentUiAction = {
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
});
