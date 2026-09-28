import { BrandVoiceProfileCard } from '@genfeedai/agent/components/BrandVoiceProfileCard';
import {
  type HandleUiActionDeps,
  handleAgentUiAction,
} from '@genfeedai/agent/hooks/agent-chat-container.ui-actions';
import type {
  AgentChatMessage,
  AgentUiAction,
  AgentUiActionHandler,
} from '@genfeedai/agent/models/agent-chat.model';
import type { AgentApiService } from '@genfeedai/agent/services/agent-api.service';
import { useAgentChatStore } from '@genfeedai/agent/stores/agent-chat.store';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

beforeEach(() => {
  useAgentChatStore.setState(useAgentChatStore.getInitialState(), true);
});

afterEach(() => {
  vi.useRealTimers();
});

/**
 * The container's real ui-action handler: it acks, and the run it started
 * settles on the thread (`settleRun` stands in for its `agent:done` /
 * `agent:error`). The api double has no read methods — nothing is polled.
 */
function realUiActionHandler(): AgentUiActionHandler {
  useAgentChatStore.setState({ activeThreadId: 'thread-1' });
  const deps: HandleUiActionDeps = {
    activeThreadId: 'thread-1',
    activeUiAction: null,
    adoptRun: vi.fn(),
    apiService: {
      respondToUiAction: vi.fn().mockResolvedValue({
        executionId: 'exec-voice',
        status: 'queued',
        threadId: 'thread-1',
      }),
    } as unknown as AgentApiService,
    beginRunHandoff: vi.fn((threadId: string) => ({
      generation: 1,
      preAssistantIds: new Set<string>(),
      previousPending: null,
      previousRunId: null,
      threadId,
    })),
    cancelRunHandoff: vi.fn(),
    followLatestTurn: vi.fn(),
    isBusy: false,
    isReadOnly: false,
    sendMessage: vi.fn(),
    setActiveUiAction: vi.fn(),
    setError: (error) => useAgentChatStore.getState().setError(error),
    threads: [],
  };
  return (action, payload) => handleAgentUiAction(action, payload, deps);
}

function settleRun(status: 'completed' | 'failed', error?: string): void {
  act(() => {
    useAgentChatStore
      .getState()
      .settleUiActionRun('thread-1', 'exec-voice', { error, status });
  });
}

const approvableAction: AgentUiAction = {
  ctas: [
    {
      action: 'confirm_save_brand_voice_profile',
      label: 'Approve and save',
      payload: { sourceActionId: 'brand-voice-live' },
    },
  ],
  data: { voiceProfile: { tone: 'confident' } },
  id: 'brand-voice-live',
  title: 'Brand Voice Draft',
  type: 'brand_voice_profile_card',
};

function messageWithAction(
  id: string,
  action: AgentUiAction,
): AgentChatMessage {
  return {
    content: 'Brand voice draft',
    createdAt: '2026-08-31T00:00:00.000Z',
    id,
    metadata: { uiActions: [action] },
    role: 'assistant',
    threadId: 'thread-1',
  };
}

function storedAction(messageIndex: number): AgentUiAction {
  const action =
    useAgentChatStore.getState().messages[messageIndex]?.metadata
      ?.uiActions?.[0];
  if (!action) {
    throw new Error(`Missing stored action at message index ${messageIndex}`);
  }
  return action;
}

describe('BrandVoiceProfileCard', () => {
  it('renders the structured brand voice fields', () => {
    const action: AgentUiAction = {
      data: {
        voiceProfile: {
          approvedHooks: ['Say the quiet part out loud'],
          audience: ['founders', 'operators'],
          bannedPhrases: ['game-changing AI'],
          canonicalSource: 'founder',
          doNotSoundLike: ['corporate jargon'],
          exemplarTexts: ['We ship systems, not vibes'],
          messagingPillars: ['clarity', 'systems'],
          sampleOutput: 'Clear systems create compounding output.',
          style: 'direct',
          tone: 'confident',
          values: ['clarity', 'proof'],
          writingRules: ['Lead with proof'],
        },
      },
      id: 'brand-voice-1',
      title: 'Brand Voice Draft',
      type: 'brand_voice_profile_card',
    };

    render(<BrandVoiceProfileCard action={action} />);

    expect(screen.getByText('confident')).toBeInTheDocument();
    expect(screen.getByText('direct')).toBeInTheDocument();
    expect(screen.getByText('founder')).toBeInTheDocument();
    expect(screen.getByText('founders, operators')).toBeInTheDocument();
    expect(screen.getByText('clarity, systems')).toBeInTheDocument();
    expect(screen.getByText('Say the quiet part out loud')).toBeInTheDocument();
    expect(screen.getByText('game-changing AI')).toBeInTheDocument();
    expect(screen.getByText('Lead with proof')).toBeInTheDocument();
    expect(screen.getByText('We ship systems, not vibes')).toBeInTheDocument();
    expect(
      screen.getByText('Clear systems create compounding output.'),
    ).toBeInTheDocument();
  });

  it('executes the approval CTA through the UI action handler', async () => {
    const onUiAction = vi.fn().mockResolvedValue(undefined);
    const action: AgentUiAction = {
      ctas: [
        {
          action: 'confirm_save_brand_voice_profile',
          label: 'Approve and save',
          payload: {
            brandId: 'brand-1',
            voiceProfile: { tone: 'confident' },
          },
        },
      ],
      data: {
        voiceProfile: {
          tone: 'confident',
        },
      },
      id: 'brand-voice-2',
      title: 'Brand Voice Draft',
      type: 'brand_voice_profile_card',
    };

    render(<BrandVoiceProfileCard action={action} onUiAction={onUiAction} />);

    fireEvent.click(screen.getByRole('button', { name: 'Approve and save' }));

    expect(onUiAction).toHaveBeenCalledWith(
      'confirm_save_brand_voice_profile',
      {
        brandId: 'brand-1',
        voiceProfile: { tone: 'confident' },
      },
    );

    await waitFor(() => {
      expect(
        screen.getByText('Brand voice saved to this brand.'),
      ).toBeInTheDocument();
    });
  });

  it('keeps the approval available when the action is rejected', async () => {
    const onUiAction = vi.fn().mockResolvedValue(false);
    const action: AgentUiAction = {
      ctas: [
        {
          action: 'confirm_save_brand_voice_profile',
          label: 'Approve and save',
        },
      ],
      data: { voiceProfile: { tone: 'confident' } },
      id: 'brand-voice-rejected',
      title: 'Brand Voice Draft',
      type: 'brand_voice_profile_card',
    };

    render(<BrandVoiceProfileCard action={action} onUiAction={onUiAction} />);

    fireEvent.click(screen.getByRole('button', { name: 'Approve and save' }));

    await waitFor(() => {
      expect(onUiAction).toHaveBeenCalledTimes(1);
    });
    expect(
      screen.queryByText('Brand voice saved to this brand.'),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Approve and save' }),
    ).toBeEnabled();
  });

  it('renders a completed action as saved after remount', async () => {
    const action: AgentUiAction = {
      ctas: [
        {
          action: 'confirm_save_brand_voice_profile',
          label: 'Approve and save',
        },
      ],
      id: 'brand-voice-completed',
      title: 'Brand Voice Draft',
      type: 'brand_voice_profile_card',
    };
    useAgentChatStore
      .getState()
      .setMessages([messageWithAction('message-1', action)]);
    const firstMount = render(
      <BrandVoiceProfileCard
        action={storedAction(0)}
        onUiAction={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Approve and save' }));
    await waitFor(() => {
      expect(storedAction(0).status).toBe('completed');
    });
    firstMount.unmount();

    render(
      <BrandVoiceProfileCard action={storedAction(0)} onUiAction={vi.fn()} />,
    );

    expect(
      screen.getByText('Brand voice saved to this brand.'),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Approve and save' }),
    ).not.toBeInTheDocument();
  });

  it('keeps approval available for a later draft of the same brand', () => {
    const completedAction: AgentUiAction = {
      data: { brandId: 'brand-1' },
      id: 'brand-voice-brand-1-first-draft',
      status: 'completed',
      title: 'Brand Voice Draft',
      type: 'brand_voice_profile_card',
    };
    const laterAction: AgentUiAction = {
      ctas: [
        {
          action: 'confirm_save_brand_voice_profile',
          label: 'Approve and save',
          payload: {
            brandId: 'brand-1',
            sourceActionId: 'brand-voice-brand-1-second-draft',
          },
        },
      ],
      data: { brandId: 'brand-1' },
      id: 'brand-voice-brand-1-second-draft',
      title: 'Brand Voice Draft',
      type: 'brand_voice_profile_card',
    };
    useAgentChatStore
      .getState()
      .setMessages([
        messageWithAction('message-1', completedAction),
        messageWithAction('message-2', laterAction),
      ]);
    const firstDraft = render(
      <BrandVoiceProfileCard action={storedAction(0)} onUiAction={vi.fn()} />,
    );
    expect(
      screen.getByText('Brand voice saved to this brand.'),
    ).toBeInTheDocument();
    firstDraft.unmount();

    render(
      <BrandVoiceProfileCard action={storedAction(1)} onUiAction={vi.fn()} />,
    );

    expect(
      screen.getByRole('button', { name: 'Approve and save' }),
    ).toBeEnabled();
    expect(
      screen.queryByText('Brand voice saved to this brand.'),
    ).not.toBeInTheDocument();
  });
  it('stays in flight, not saved, while the accepted save runs', async () => {
    useAgentChatStore
      .getState()
      .setMessages([messageWithAction('message-1', approvableAction)]);
    render(
      <BrandVoiceProfileCard
        action={storedAction(0)}
        onUiAction={realUiActionHandler()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Approve and save' }));

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('Still saving.');
    });
    expect(
      screen.queryByText('Brand voice saved to this brand.'),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Saving...' })).toBeDisabled();
    expect(storedAction(0).status).toBeUndefined();
  });

  it('settles as saved when its run completes', async () => {
    useAgentChatStore
      .getState()
      .setMessages([messageWithAction('message-1', approvableAction)]);
    render(
      <BrandVoiceProfileCard
        action={storedAction(0)}
        onUiAction={realUiActionHandler()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Approve and save' }));
    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('Still saving.');
    });
    settleRun('completed');

    expect(
      screen.getByText('Brand voice saved to this brand.'),
    ).toBeInTheDocument();
  });

  it('offers the approval again with the run error when the save fails', async () => {
    useAgentChatStore
      .getState()
      .setMessages([messageWithAction('message-1', approvableAction)]);
    render(
      <BrandVoiceProfileCard
        action={storedAction(0)}
        onUiAction={realUiActionHandler()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Approve and save' }));
    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('Still saving.');
    });
    settleRun('failed', 'Brand voice could not be saved.');

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Brand voice could not be saved.',
    );
    expect(
      screen.getByRole('button', { name: 'Approve and save' }),
    ).toBeEnabled();
    expect(
      screen.queryByText('Brand voice saved to this brand.'),
    ).not.toBeInTheDocument();
    expect(storedAction(0).status).toBeUndefined();
  });
});
