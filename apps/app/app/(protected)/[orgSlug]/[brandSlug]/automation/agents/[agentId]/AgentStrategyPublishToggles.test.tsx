import '@testing-library/jest-dom/vitest';
import type { AgentStrategyPublishPolicy } from '@services/automation/agent-strategies.service';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { createContext, type ReactNode, useContext } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AgentStrategyPublishToggles from './AgentStrategyPublishToggles';

const update = vi.hoisted(() => vi.fn());
const notifications = vi.hoisted(() => ({
  error: vi.fn(),
  success: vi.fn(),
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => async () => ({ update }),
}));

vi.mock('@services/core/notifications.service', () => ({
  NotificationsService: { getInstance: () => notifications },
}));

vi.mock('@services/core/logger.service', () => ({
  logger: { error: vi.fn() },
}));

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import(
    '../../../../../../../tests/next-intl.stub'
  );

  return { useTranslations: translateFromCatalog };
});

// Radix Select does not open in jsdom; each item becomes a clickable option.
const SelectChange = createContext<(value: string) => void>(() => undefined);
vi.mock('@ui/primitives/select', () => ({
  Select: ({
    children,
    onValueChange,
  }: {
    children: ReactNode;
    onValueChange: (value: string) => void;
  }) => (
    <SelectChange.Provider value={onValueChange}>
      {children}
    </SelectChange.Provider>
  ),
  SelectContent: ({ children }: { children: ReactNode }) => (
    <div role="listbox">{children}</div>
  ),
  SelectItem: function SelectItem({
    children,
    value,
  }: {
    children: ReactNode;
    value: string;
  }) {
    const onValueChange = useContext(SelectChange);
    return (
      <span
        aria-selected={false}
        onClick={() => onValueChange(value)}
        onKeyDown={() => onValueChange(value)}
        role="option"
        tabIndex={0}
      >
        {children}
      </span>
    );
  },
  SelectTrigger: () => null,
  SelectValue: () => null,
}));

const policy = {
  autoPublishEnabled: false,
  minImageScore: 75,
  minPostScore: 70,
} as AgentStrategyPublishPolicy;

function renderCard(
  publishPolicy: AgentStrategyPublishPolicy,
  platforms: string[] = ['linkedin'],
  onSaved = vi.fn().mockResolvedValue(undefined),
) {
  render(
    <AgentStrategyPublishToggles
      agentId="agent-1"
      onSaved={onSaved}
      strategy={{ platforms, publishPolicy }}
    />,
  );
  return onSaved;
}

beforeEach(() => {
  vi.clearAllMocks();
  update.mockResolvedValue({});
});
afterEach(cleanup);

describe('AgentStrategyPublishToggles', () => {
  it('starts every configured platform in review while auto-publish is off', () => {
    renderCard(policy);

    const progress = screen.getByRole('region', { name: 'Platform progress' });
    expect(within(progress).getByText('LinkedIn')).toBeVisible();
    expect(within(progress).getByText('0/5 approvals in a row')).toBeVisible();
    expect(within(progress).getByText('Review required')).toBeVisible();
    expect(
      screen.getByText('Auto-publish is off, so every draft waits for review.'),
    ).toBeVisible();
    expect(
      screen.getByRole('checkbox', { name: 'Earn auto-publish per platform' }),
    ).not.toBeChecked();
  });

  it('shows each platform streak and graduation against the stored threshold', () => {
    renderCard(
      {
        ...policy,
        autoPublishAfterApprovals: 3,
        autoPublishEnabled: true,
        platformStates: {
          linkedin: {
            approvalStreak: 3,
            autoPublishEnabled: true,
            lastDecisionKey: 'private-key',
          },
          instagram: { approvalStreak: 1, autoPublishEnabled: false },
        },
      },
      ['linkedin'],
    );

    const rows = screen.getAllByRole('listitem');
    expect(rows.map((row) => row.textContent)).toEqual([
      'LinkedIn3/3 approvals in a rowPublishes on its own',
      'Instagram1/3 approvals in a rowReview required',
    ]);
    expect(
      screen.getByRole('progressbar', {
        name: 'LinkedIn progress toward auto-publish',
      }),
    ).toBeVisible();
    expect(screen.queryByText('private-key')).not.toBeInTheDocument();
    expect(
      screen.queryByText(
        'Auto-publish is off, so every draft waits for review.',
      ),
    ).not.toBeInTheDocument();
  });

  it('asks for a platform when the agent has none', () => {
    renderCard(policy, []);

    expect(
      screen.getByText('Add a platform to this agent to track its progress.'),
    ).toBeVisible();
  });

  it('persists the opt-in without touching recorded graduation', async () => {
    const onSaved = renderCard(policy);

    fireEvent.click(
      screen.getByRole('checkbox', { name: 'Earn auto-publish per platform' }),
    );

    await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
    expect(update).toHaveBeenCalledWith('agent-1', {
      publishPolicy: { autoPublishEnabled: true },
    });
    expect(notifications.success).toHaveBeenCalledWith(
      'Auto-publish settings saved',
    );
  });

  it('persists the number of approvals a platform needs to graduate', async () => {
    const onSaved = renderCard(policy);

    fireEvent.click(screen.getByRole('option', { name: '10' }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
    expect(update).toHaveBeenCalledWith('agent-1', {
      publishPolicy: { autoPublishAfterApprovals: 10 },
    });
  });

  it('reports a failed save and keeps the stored setting', async () => {
    update.mockRejectedValue(new Error('offline'));
    const onSaved = renderCard(policy);

    fireEvent.click(
      screen.getByRole('checkbox', { name: 'Earn auto-publish per platform' }),
    );

    await waitFor(() =>
      expect(notifications.error).toHaveBeenCalledWith(
        'Could not save auto-publish settings',
      ),
    );
    expect(onSaved).not.toHaveBeenCalled();
    expect(
      screen.getByRole('checkbox', { name: 'Earn auto-publish per platform' }),
    ).not.toBeChecked();
  });
});
