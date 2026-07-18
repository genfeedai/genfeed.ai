import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AgentsView } from './AgentsView';

const cloudApi = {
  listAgents: vi.fn(),
  runAgent: vi.fn(),
};

const notificationsApi = {
  notify: vi.fn(),
};

const agent = {
  id: 'agent-1',
  isActive: true,
  lastRunAt: '2026-06-11T06:00:00.000Z',
  latestRun: {
    completedAt: '2026-06-11T06:02:00.000Z',
    contentGenerated: 3,
    creditsUsed: 12,
    id: 'run-1',
    outputSummary: 'Generated three LinkedIn hooks for the launch angle.',
    startedAt: '2026-06-11T06:00:00.000Z',
    status: 'completed' as const,
    threadId: 'thread-1',
  },
  name: 'Trend Scout',
  platforms: ['linkedin'],
  recentRuns: [
    {
      completedAt: '2026-06-11T06:02:00.000Z',
      contentGenerated: 3,
      creditsUsed: 12,
      id: 'run-1',
      outputSummary: 'Generated three LinkedIn hooks for the launch angle.',
      startedAt: '2026-06-11T06:00:00.000Z',
      status: 'completed' as const,
      threadId: 'thread-1',
    },
  ],
  status: 'active' as const,
};

describe('AgentsView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cloudApi.listAgents.mockReset();
    cloudApi.runAgent.mockReset();
    notificationsApi.notify.mockReset();
    cloudApi.listAgents.mockResolvedValue([agent]);
    notificationsApi.notify.mockResolvedValue(undefined);

    Object.defineProperty(window, 'genfeedDesktop', {
      configurable: true,
      value: {
        cloud: cloudApi,
        notifications: notificationsApi,
      },
    });
  });

  it('shows latest run output and hands it to the composer', async () => {
    const onRunHandoff = vi.fn();

    render(
      <AgentsView
        hasCloudSession
        isOnline
        onConnectCloud={vi.fn()}
        onRunHandoff={onRunHandoff}
      />,
    );

    expect(
      await screen.findByText(
        'Generated three LinkedIn hooks for the launch angle.',
      ),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Send to composer' }));

    expect(onRunHandoff).toHaveBeenCalledWith({
      agentName: 'Trend Scout',
      run: expect.objectContaining({
        contentGenerated: 3,
        threadId: 'thread-1',
      }),
    });
  });

  it('shows a manual run status after triggering an agent', async () => {
    cloudApi.runAgent.mockResolvedValue({
      message:
        'Proactive run queued. It will execute on the next minute cycle.',
      runId: '',
      status: 'pending',
    });

    render(<AgentsView hasCloudSession isOnline onConnectCloud={vi.fn()} />);

    fireEvent.click(await screen.findByRole('button', { name: '▶ Run' }));

    await waitFor(() =>
      expect(screen.getByText('Manual run status')).toBeInTheDocument(),
    );
    await waitFor(() =>
      expect(screen.getByText('Pending')).toBeInTheDocument(),
    );
    expect(notificationsApi.notify).toHaveBeenCalledWith(
      'Agent run queued',
      'Proactive run queued. It will execute on the next minute cycle.',
    );
  });

  it('routes account-less cloud runs to the connect action', async () => {
    const onConnectCloud = vi.fn();
    render(
      <AgentsView
        hasCloudSession={false}
        isOnline={false}
        onConnectCloud={onConnectCloud}
      />,
    );

    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Connect Cloud to run',
      }),
    );

    expect(onConnectCloud).toHaveBeenCalledTimes(1);
    expect(cloudApi.runAgent).not.toHaveBeenCalled();
  });
});
