import '@testing-library/jest-dom/vitest';
import {
  AgentAutonomyMode,
  AgentRunFrequency,
  AgentType,
} from '@genfeedai/contracts';
import type { AgentStrategyFormState } from '@props/automation/agent-strategies-page.props';
import type { AgentStrategyPublishPolicy } from '@services/automation/agent-strategies.service';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AgentStrategyPublishToggles from './AgentStrategyPublishToggles';

const form: AgentStrategyFormState = {
  agentType: AgentType.GENERAL,
  autonomyMode: AgentAutonomyMode.SUPERVISED,
  autoPublishConfidenceThreshold: '0.8',
  autoPublishEnabled: false,
  dailyCreditBudget: '100',
  dailyDigestEnabled: true,
  eventTriggersEnabled: true,
  evergreenCadenceEnabled: true,
  goalProfile: 'reach_traffic',
  isActive: true,
  isEnabled: true,
  label: 'Craft',
  minCreditThreshold: '50',
  minImageScore: '75',
  minPostScore: '70',
  monthlyCreditBudget: '500',
  platforms: ['linkedin'],
  reserveTrendBudget: '125',
  runFrequency: AgentRunFrequency.DAILY,
  skillSlugs: [],
  topics: 'craft',
  trendWatchersEnabled: true,
  weeklySummaryEnabled: true,
};
const policy: AgentStrategyPublishPolicy = {
  autoPublishEnabled: false,
  brandSafetyMode: 'strict',
  minImageScore: 75,
  minPostScore: 70,
  videoAutopublishEnabled: false,
};

afterEach(cleanup);
describe('persisted platform approval progress', () => {
  it('shows configured defaults and independent opt-out', () => {
    render(<AgentStrategyPublishToggles form={form} setForm={vi.fn()} />);
    const progress = screen.getByRole('region', {
      name: 'Platform approval progress',
    });
    expect(within(progress).getByText('LinkedIn')).toBeVisible();
    expect(within(progress).getByText('0/5 pristine approvals')).toBeVisible();
    expect(within(progress).getByText('Review required')).toBeVisible();
    expect(
      screen.getByText('Automatic publishing is off for this agent.'),
    ).toBeVisible();
  });

  it('preserves configured order and displays stored graduation without exposing decision keys', () => {
    const persisted = Object.freeze({
      ...policy,
      autoPublishAfterApprovals: 2,
      platformStates: Object.freeze({
        linkedin: Object.freeze({
          approvalStreak: 3,
          autoPublishEnabled: true,
          lastDecisionKey: 'private-key',
        }),
        mastodon: Object.freeze({
          approvalStreak: 2,
          autoPublishEnabled: false,
        }),
        instagram: Object.freeze({
          approvalStreak: 1,
          autoPublishEnabled: false,
        }),
      }),
    });
    render(
      <AgentStrategyPublishToggles
        form={{ ...form, platforms: ['linkedin', 'linkedin'] }}
        setForm={vi.fn()}
        publishPolicy={persisted}
      />,
    );
    const rows = screen.getAllByRole('listitem');
    expect(rows.map((row) => row.textContent)).toEqual([
      'LinkedIn3/2 pristine approvalsGraduated',
      'Instagram1/2 pristine approvalsReview required',
      'mastodon2/2 pristine approvalsReview required',
    ]);
    expect(screen.queryByText('private-key')).not.toBeInTheDocument();
    expect(
      screen.getByText('Automatic publishing is off for this agent.'),
    ).toBeVisible();
  });

  it.each([0, -1, 1.5, 101, Number.NaN, Number.POSITIVE_INFINITY])(
    'uses the server default for invalid threshold %s',
    (threshold) => {
      render(
        <AgentStrategyPublishToggles
          form={form}
          setForm={vi.fn()}
          publishPolicy={{
            ...policy,
            autoPublishAfterApprovals: threshold,
            platformStates: {
              linkedin: { approvalStreak: -1, autoPublishEnabled: false },
            },
          }}
        />,
      );
      expect(screen.getByText('0/5 pristine approvals')).toBeVisible();
    },
  );

  it.each([-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    'shows zero for invalid persisted approval streak %s',
    (approvalStreak) => {
      render(
        <AgentStrategyPublishToggles
          form={form}
          setForm={vi.fn()}
          publishPolicy={{
            ...policy,
            platformStates: {
              linkedin: { approvalStreak, autoPublishEnabled: false },
            },
          }}
        />,
      );
      expect(screen.getByText('0/5 pristine approvals')).toBeVisible();
    },
  );

  it.each([1, 5, 12, 100])('shows valid threshold %s', (threshold) => {
    render(
      <AgentStrategyPublishToggles
        form={form}
        setForm={vi.fn()}
        publishPolicy={{ ...policy, autoPublishAfterApprovals: threshold }}
      />,
    );
    expect(screen.getByText(`0/${threshold} pristine approvals`)).toBeVisible();
  });

  it('shows refreshed rejection and the empty platform state', () => {
    const { rerender } = render(
      <AgentStrategyPublishToggles
        form={{ ...form, autoPublishEnabled: true }}
        setForm={vi.fn()}
        publishPolicy={{
          ...policy,
          platformStates: {
            linkedin: { approvalStreak: 5, autoPublishEnabled: true },
          },
        }}
      />,
    );
    expect(screen.getByText('Graduated')).toBeVisible();
    expect(
      screen.queryByText('Automatic publishing is off for this agent.'),
    ).not.toBeInTheDocument();
    rerender(
      <AgentStrategyPublishToggles
        form={form}
        setForm={vi.fn()}
        publishPolicy={{
          ...policy,
          platformStates: {
            linkedin: { approvalStreak: 0, autoPublishEnabled: false },
          },
        }}
      />,
    );
    expect(screen.queryByText('Graduated')).not.toBeInTheDocument();
    expect(screen.getByText('Review required')).toBeVisible();
    rerender(
      <AgentStrategyPublishToggles
        form={{ ...form, platforms: [] }}
        setForm={vi.fn()}
      />,
    );
    expect(
      screen.getByText('Choose a platform to track approval progress.'),
    ).toBeVisible();
  });

  it('only updates the existing opt-in boolean when toggled', () => {
    const setForm = vi.fn();
    const persisted = Object.freeze({
      ...policy,
      platformStates: Object.freeze({
        linkedin: Object.freeze({
          approvalStreak: 5,
          autoPublishEnabled: true,
        }),
      }),
    });
    render(
      <AgentStrategyPublishToggles
        form={form}
        setForm={setForm}
        publishPolicy={persisted}
      />,
    );
    fireEvent.click(
      screen.getByRole('checkbox', {
        name: 'Allow automatic publishing when policy checks pass',
      }),
    );
    expect(setForm).toHaveBeenCalledTimes(1);
    expect(setForm.mock.calls[0][0](form)).toEqual({
      ...form,
      autoPublishEnabled: true,
    });
    expect(persisted.platformStates.linkedin).toEqual({
      approvalStreak: 5,
      autoPublishEnabled: true,
    });
  });
});
