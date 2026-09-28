import { BrandInterviewOfferCard } from '@genfeedai/agent/components/BrandInterviewOfferCard';
import { LivestreamBotCard } from '@genfeedai/agent/components/LivestreamBotCard';
import { PublishPostCard } from '@genfeedai/agent/components/PublishPostCard';
import { SchedulePostCard } from '@genfeedai/agent/components/SchedulePostCard';
import { WorkflowCreatedCard } from '@genfeedai/agent/components/WorkflowCreatedCard';
import type {
  AgentUiAction,
  AgentUiActionHandler,
} from '@genfeedai/agent/models/agent-chat.model';
import { useAgentChatStore } from '@genfeedai/agent/stores/agent-chat.store';
import { getAgentUiActionSourceId } from '@genfeedai/contracts/interfaces';
import { act, fireEvent, render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@hooks/data/content/use-posting-sets/use-posting-sets', () => ({
  usePostingSets: () => ({
    createSet: vi.fn(),
    expandError: null,
    expandSet: vi.fn(),
    isExpanding: false,
    isLoading: false,
    isSaving: false,
    saveError: null,
    sets: [],
  }),
}));

vi.mock(
  '@hooks/data/content/use-posting-signatures/use-posting-signatures',
  () => ({
    usePostingSignatures: () => ({ isLoading: false, signatures: [] }),
  }),
);

function MockPicker() {
  return null;
}

vi.mock('@ui/publisher/PostingSetPicker', () => ({ default: MockPicker }));
vi.mock('@ui/publisher/PostingSignaturePicker', () => ({
  default: MockPicker,
}));

beforeEach(() => {
  useAgentChatStore.setState(useAgentChatStore.getInitialState(), true);
  useAgentChatStore.setState({ activeThreadId: 'thread-1' });
});

/**
 * What the container's handler does on an ack: the run it started is tracked
 * on the thread as pending, and the handler reports `'pending'`.
 */
function trackRun(
  action: string,
  payload: Record<string, unknown> | undefined,
): void {
  useAgentChatStore.getState().trackUiActionRun('thread-1', {
    action,
    runId: 'exec-1',
    sourceId: getAgentUiActionSourceId(payload),
  });
}

function acceptingHandler() {
  return vi.fn(async (action: string, payload?: Record<string, unknown>) => {
    trackRun(action, payload);
    return 'pending' as const;
  });
}

/** The run's `agent:done` / `agent:error` settling it on the thread. */
function settleRun(status: 'completed' | 'failed'): void {
  act(() => {
    useAgentChatStore.getState().settleUiActionRun('thread-1', 'exec-1', {
      ...(status === 'failed' ? { error: 'The run failed.' } : {}),
      status,
    });
  });
}

async function clickAndResolve(
  handler: ReturnType<typeof vi.fn>,
  name: string | RegExp,
): Promise<void> {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name }));
    await handler.mock.results.at(-1)?.value;
  });
}

type CardCase = {
  action: AgentUiAction;
  busyLabel: string | RegExp;
  doneText: string | RegExp;
  idleLabel: string | RegExp;
  render: (onUiAction: AgentUiActionHandler) => ReactElement;
  runAction: string;
  runPayload: Record<string, unknown> | undefined;
};

const publishAction: AgentUiAction = {
  contentId: 'ingredient-1',
  data: { availablePlatforms: ['linkedin'] },
  id: 'publish-card-1',
  platforms: ['linkedin'],
  title: 'Publish selected content',
  type: 'publish_post_card',
};

const scheduleAction: AgentUiAction = {
  contentId: 'ingredient-2',
  id: 'schedule-card-1',
  platforms: ['instagram'],
  scheduledAt: '2026-04-01T10:00',
  // Untitled, so the scheduled view shows its own confirmation copy.
  title: '',
  type: 'schedule_post_card',
};

const startInterviewPayload = { brandId: 'brand-1' };
const interviewAction: AgentUiAction = {
  ctas: [
    {
      action: 'start_interview',
      label: 'Start interview',
      payload: startInterviewPayload,
    },
  ],
  id: 'interview-card-1',
  title: 'Brand Context Interview',
  type: 'brand_interview_offer_card',
};

const installPayload = { sourceId: 'template-1' };
const workflowAction: AgentUiAction = {
  ctas: [
    {
      action: 'confirm_install_official_workflow',
      label: 'Confirm install',
      payload: installPayload,
    },
  ],
  id: 'workflow-card-1',
  title: 'Install official workflow?',
  type: 'workflow_created_card',
};

const botPayload = { botId: 'bot-1' };
const botAction: AgentUiAction = {
  ctas: [
    { action: 'pause_livestream_bot', label: 'Pause', payload: botPayload },
  ],
  id: 'bot-card-1',
  title: 'Livestream bot',
  type: 'livestream_bot_status_card',
};

const cases: Array<[string, CardCase]> = [
  [
    'PublishPostCard',
    {
      action: publishAction,
      busyLabel: 'Publishing...',
      doneText: 'Publish confirmed from chat.',
      idleLabel: 'Confirm publish',
      render: (onUiAction) => (
        <PublishPostCard action={publishAction} onUiAction={onUiAction} />
      ),
      runAction: 'confirm_publish_post',
      runPayload: { sourceActionId: publishAction.id },
    },
  ],
  [
    'SchedulePostCard',
    {
      action: scheduleAction,
      busyLabel: /Scheduling/,
      doneText: /Post scheduled for/,
      idleLabel: 'Schedule',
      render: (onUiAction) => (
        <SchedulePostCard action={scheduleAction} onUiAction={onUiAction} />
      ),
      runAction: 'confirm_publish_post',
      runPayload: { sourceActionId: scheduleAction.id },
    },
  ],
  [
    'BrandInterviewOfferCard',
    {
      action: interviewAction,
      busyLabel: 'Starting...',
      doneText: 'Interview started.',
      idleLabel: 'Start interview',
      render: (onUiAction) => (
        <BrandInterviewOfferCard
          action={interviewAction}
          onUiAction={onUiAction}
        />
      ),
      runAction: 'start_interview',
      runPayload: startInterviewPayload,
    },
  ],
  [
    'WorkflowCreatedCard',
    {
      action: workflowAction,
      busyLabel: 'Installing...',
      doneText: 'Installed',
      idleLabel: 'Confirm install',
      render: (onUiAction) => (
        <WorkflowCreatedCard action={workflowAction} onUiAction={onUiAction} />
      ),
      runAction: 'confirm_install_official_workflow',
      runPayload: installPayload,
    },
  ],
  [
    'LivestreamBotCard',
    {
      action: botAction,
      busyLabel: 'Working...',
      doneText: 'Done',
      idleLabel: 'Pause',
      render: (onUiAction) => (
        <LivestreamBotCard action={botAction} onUiAction={onUiAction} />
      ),
      runAction: 'pause_livestream_bot',
      runPayload: botPayload,
    },
  ],
];

describe.each(cases)('%s ui-action outcomes', (_name, card) => {
  it('shows success only for a completed outcome', async () => {
    const onUiAction = vi.fn().mockResolvedValue(true);
    render(card.render(onUiAction));

    await clickAndResolve(onUiAction, card.idleLabel);

    expect(screen.getByText(card.doneText)).toBeInTheDocument();
  });

  it('keeps the action available after a failed outcome', async () => {
    const onUiAction = vi.fn().mockResolvedValue(false);
    render(card.render(onUiAction));

    await clickAndResolve(onUiAction, card.idleLabel);

    expect(screen.queryByText(card.doneText)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: card.idleLabel })).toBeEnabled();
  });

  it('stays in flight on a pending outcome and settles when the run completes', async () => {
    const onUiAction = acceptingHandler();
    render(card.render(onUiAction));

    await clickAndResolve(onUiAction, card.idleLabel);

    expect(screen.queryByText(card.doneText)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: card.busyLabel })).toBeDisabled();

    settleRun('completed');

    expect(screen.getByText(card.doneText)).toBeInTheDocument();
  });

  it('re-enables the action when a pending run fails', async () => {
    const onUiAction = acceptingHandler();
    render(card.render(onUiAction));

    await clickAndResolve(onUiAction, card.idleLabel);
    settleRun('failed');

    expect(screen.queryByText(card.doneText)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: card.idleLabel })).toBeEnabled();
  });

  it('derives the in-flight state from a still-pending run after a remount', () => {
    trackRun(card.runAction, card.runPayload);
    render(card.render(vi.fn()));

    expect(screen.getByRole('button', { name: card.busyLabel })).toBeDisabled();
  });

  it('settles a card remounted while its run was pending', () => {
    trackRun(card.runAction, card.runPayload);
    const { unmount } = render(card.render(vi.fn()));
    unmount();
    settleRun('completed');

    render(card.render(vi.fn()));

    expect(screen.getByText(card.doneText)).toBeInTheDocument();
  });
});
