import { BrandVoiceProfileCard } from '@genfeedai/agent/components/BrandVoiceProfileCard';
import {
  type HandleUiActionDeps,
  handleAgentUiAction,
  UI_ACTION_BACKGROUND_INITIAL_DELAY_MS,
  UI_ACTION_RECONCILE_TIMEOUT_MS,
} from '@genfeedai/agent/hooks/agent-chat-container.ui-actions';
import type {
  AgentChatMessage,
  AgentUiAction,
  AgentUiActionHandler,
} from '@genfeedai/agent/models/agent-chat.model';
import type { AgentApiService } from '@genfeedai/agent/services/agent-api.service';
import { useAgentChatStore } from '@genfeedai/agent/stores/agent-chat.store';
import { AgentThreadMode, WorkflowExecutionStatus } from '@genfeedai/contracts';
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
 * The container's real ui-action handler over a thread whose run acks and
 * then reports `execution` without ever persisting a reply.
 */
function realUiActionHandler(
  execution: { error?: string; status: WorkflowExecutionStatus },
  apiOverrides: Record<string, unknown> = {},
): AgentUiActionHandler {
  useAgentChatStore.setState({ activeThreadId: 'thread-1' });
  const deps: HandleUiActionDeps = {
    activeThreadId: 'thread-1',
    activeUiAction: null,
    addMessage: (message) => useAgentChatStore.getState().addMessage(message),
    apiService: {
      getCreditsInfo: vi.fn(),
      getMessages: vi.fn().mockResolvedValue([]),
      getThread: vi.fn(),
      getWorkflowExecution: vi
        .fn()
        .mockResolvedValue({ id: 'exec-voice', ...execution }),
      respondToUiAction: vi.fn().mockResolvedValue({
        executionId: 'exec-voice',
        status: 'queued',
        threadId: 'thread-1',
      }),
      ...apiOverrides,
    } as unknown as AgentApiService,
    draftAgentMode: AgentThreadMode.MANUAL,
    followLatestTurn: vi.fn(),
    isBusy: false,
    isReadOnly: false,
    latestProposedPlan: null,
    reconcilingRuns: new Map(),
    sendMessage: vi.fn(),
    setActiveThread: vi.fn(),
    setActiveUiAction: vi.fn(),
    setCreditsRemaining: vi.fn(),
    setError: (error) => useAgentChatStore.getState().setError(error),
    setLatestProposedPlan: vi.fn(),
    signal: new AbortController().signal,
    threads: [],
    upsertThread: vi.fn(),
  };
  return (action, payload) => handleAgentUiAction(action, payload, deps);
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
  it('stays in flight, not saved, when the save is accepted but unconfirmed', async () => {
    vi.useFakeTimers();
    useAgentChatStore
      .getState()
      .setMessages([messageWithAction('message-1', approvableAction)]);
    render(
      <BrandVoiceProfileCard
        action={storedAction(0)}
        onUiAction={realUiActionHandler({
          status: WorkflowExecutionStatus.RUNNING,
        })}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Approve and save' }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(UI_ACTION_RECONCILE_TIMEOUT_MS + 1_000);
    });

    expect(
      screen.queryByText('Brand voice saved to this brand.'),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Saving...' })).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent('Still saving.');
    expect(storedAction(0).status).toBeUndefined();
  });

  it('keeps the approval available when the save execution fails', async () => {
    useAgentChatStore
      .getState()
      .setMessages([messageWithAction('message-1', approvableAction)]);
    render(
      <BrandVoiceProfileCard
        action={storedAction(0)}
        onUiAction={realUiActionHandler({
          error: 'Brand voice could not be saved.',
          status: WorkflowExecutionStatus.FAILED,
        })}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Approve and save' }));

    await waitFor(() => {
      expect(useAgentChatStore.getState().error).toBe(
        'Brand voice could not be saved.',
      );
    });
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: 'Approve and save' }),
      ).toBeEnabled();
    });
    expect(
      screen.queryByText('Brand voice saved to this brand.'),
    ).not.toBeInTheDocument();
    expect(storedAction(0).status).toBeUndefined();
  });
  it('settles as saved when the save completes after the card stopped waiting', async () => {
    vi.useFakeTimers();
    let execution = { status: WorkflowExecutionStatus.RUNNING };
    let messages: AgentChatMessage[] = [];
    useAgentChatStore
      .getState()
      .setMessages([messageWithAction('message-1', approvableAction)]);
    render(
      <BrandVoiceProfileCard
        action={storedAction(0)}
        onUiAction={realUiActionHandler(execution, {
          getCreditsInfo: vi.fn().mockResolvedValue(null),
          getMessages: vi.fn(async () => messages),
          getThread: vi.fn().mockResolvedValue(null),
          getWorkflowExecution: vi.fn(async () => ({
            id: 'exec-voice',
            ...execution,
          })),
        })}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Approve and save' }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(UI_ACTION_RECONCILE_TIMEOUT_MS + 1_000);
    });
    expect(screen.getByRole('status')).toHaveTextContent('Still saving.');

    execution = { status: WorkflowExecutionStatus.COMPLETED };
    messages = [
      {
        content: 'Brand voice saved.',
        createdAt: '2026-08-31T00:01:00.000Z',
        id: 'reply-voice',
        metadata: { runId: 'exec-voice' },
        role: 'assistant',
        threadId: 'thread-1',
      },
    ];
    await act(async () => {
      await vi.advanceTimersByTimeAsync(UI_ACTION_BACKGROUND_INITIAL_DELAY_MS);
    });

    expect(
      screen.getByText('Brand voice saved to this brand.'),
    ).toBeInTheDocument();
  });

  it('offers the approval again when the save fails after the card stopped waiting', async () => {
    vi.useFakeTimers();
    let execution: { error?: string; status: WorkflowExecutionStatus } = {
      status: WorkflowExecutionStatus.RUNNING,
    };
    useAgentChatStore
      .getState()
      .setMessages([messageWithAction('message-1', approvableAction)]);
    render(
      <BrandVoiceProfileCard
        action={storedAction(0)}
        onUiAction={realUiActionHandler(execution, {
          getWorkflowExecution: vi.fn(async () => ({
            id: 'exec-voice',
            ...execution,
          })),
        })}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Approve and save' }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(UI_ACTION_RECONCILE_TIMEOUT_MS + 1_000);
    });
    execution = {
      error: 'Brand voice could not be saved.',
      status: WorkflowExecutionStatus.FAILED,
    };
    await act(async () => {
      await vi.advanceTimersByTimeAsync(UI_ACTION_BACKGROUND_INITIAL_DELAY_MS);
    });

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Brand voice could not be saved.',
    );
    expect(
      screen.getByRole('button', { name: 'Approve and save' }),
    ).toBeEnabled();
    expect(
      screen.queryByText('Brand voice saved to this brand.'),
    ).not.toBeInTheDocument();
  });
});
