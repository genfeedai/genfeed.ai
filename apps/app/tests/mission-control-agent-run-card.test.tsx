import { AgentExecutionStatus, AgentExecutionTrigger } from '@genfeedai/enums';
import type { IAgentRun } from '@genfeedai/interfaces';
import AgentRunCard from '@pages/mission-control/components/AgentRunCard';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@ui/buttons/base/Button', () => ({
  default: ({
    children,
    onClick,
  }: {
    children: ReactNode;
    onClick?: () => void;
  }) => <button onClick={onClick}>{children}</button>,
}));

const RUN: IAgentRun = {
  completedAt: '2026-03-26T10:10:00.000Z',
  conversation: undefined,
  createdAt: '2026-03-26T10:00:00.000Z',
  creditBudget: undefined,
  creditsUsed: 4,
  durationMs: 12000,
  id: 'run-1',
  label: 'Fresh trend scan',
  metadata: {
    actualModel: 'google/gemini-2.5-flash',
    requestedModel: 'openrouter/auto',
    routingPolicy: 'fresh-live-data',
  },
  objective: 'Find current creator economy trends',
  organization: 'org-1',
  parentRun: undefined,
  progress: 100,
  retryCount: 0,
  startedAt: '2026-03-26T10:01:00.000Z',
  status: AgentExecutionStatus.COMPLETED,
  strategy: 'Trend watch',
  summary: undefined,
  toolCalls: [],
  trigger: AgentExecutionTrigger.MANUAL,
  updatedAt: '2026-03-26T10:10:00.000Z',
  user: 'user-1',
};

describe('AgentRunCard', () => {
  it('renders actual versus requested model metadata', () => {
    render(<AgentRunCard run={RUN} />);

    expect(
      screen.getByText('Model: google/gemini-2.5-flash via openrouter/auto'),
    ).toBeInTheDocument();
    expect(screen.getByText('Routing: fresh-live-data')).toBeInTheDocument();
  });
});
