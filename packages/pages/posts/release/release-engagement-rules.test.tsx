import {
  CredentialPlatform,
  EngagementMetric,
  EngagementRuleAction,
  EngagementRuleMode,
  EngagementRuleState,
  ReleaseTargetSource,
  TargetExecutionState,
  TargetValidationState,
} from '@genfeedai/contracts';
import type {
  IChannelTarget,
  IEngagementRule,
} from '@genfeedai/contracts/interfaces';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import ReleaseEngagementRules from './release-engagement-rules';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  error: vi.fn(),
  href: vi.fn((path: string) => `/acme${path}`),
  success: vi.fn(),
  update: vi.fn(),
}));

const rulesState: { rules: IEngagementRule[] } = { rules: [] };

vi.mock('@hooks/data/content/use-engagement-rules', () => ({
  useEngagementRules: () => ({
    create: mocks.create,
    isLoading: false,
    rules: rulesState.rules,
    update: mocks.update,
  }),
}));

vi.mock('@hooks/navigation/use-org-url/use-org-url', () => ({
  useOrgUrl: () => ({ href: mocks.href }),
}));

vi.mock('@services/core/logger.service', () => ({
  logger: { error: vi.fn() },
}));

vi.mock('@services/core/notifications.service', () => ({
  NotificationsService: {
    getInstance: () => ({
      error: mocks.error,
      success: mocks.success,
    }),
  },
}));

vi.mock('@ui/primitives/button', () => ({
  Button: ({
    children,
    isDisabled,
    label,
    onClick,
  }: {
    children?: ReactNode;
    isDisabled?: boolean;
    label?: string;
    onClick?: () => void;
  }) => (
    <button disabled={isDisabled} type="button" onClick={onClick}>
      {label ?? children}
    </button>
  ),
}));

vi.mock('@ui/primitives/input', () => ({
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => (
    <input {...props} />
  ),
}));

vi.mock('@ui/primitives/select', () => ({
  Select: ({
    children,
    onValueChange,
    value,
  }: {
    children?: ReactNode;
    onValueChange?: (value: string) => void;
    value?: string;
  }) => (
    <div data-testid="select" data-value={value}>
      <button type="button" onClick={() => onValueChange?.(String(value))}>
        select
      </button>
      {children}
    </div>
  ),
  SelectContent: ({ children }: { children?: ReactNode }) => (
    <div>{children}</div>
  ),
  SelectItem: ({
    children,
    value,
  }: {
    children?: ReactNode;
    value: string;
  }) => <div data-value={value}>{children}</div>,
  SelectTrigger: ({ children, id }: { children?: ReactNode; id?: string }) => (
    <div id={id}>{children}</div>
  ),
  SelectValue: ({ placeholder }: { placeholder?: string }) => (
    <span>{placeholder}</span>
  ),
}));

vi.mock('@ui/primitives/switch', () => ({
  Switch: ({
    'aria-label': ariaLabel,
    isChecked,
    label,
    onChange,
  }: {
    'aria-label'?: string;
    isChecked?: boolean;
    label?: string;
    onChange?: (event: React.ChangeEvent<HTMLInputElement>) => void;
  }) => (
    <label>
      {label ?? ariaLabel}
      <input
        aria-label={ariaLabel}
        checked={Boolean(isChecked)}
        type="checkbox"
        onChange={onChange}
      />
    </label>
  ),
}));

vi.mock('@ui/primitives/badge', () => ({
  Badge: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
}));

function target(): IChannelTarget {
  return {
    executionState: TargetExecutionState.PUBLISHED,
    id: 'target-1',
    platform: CredentialPlatform.INSTAGRAM,
    retryCount: 0,
    scheduledAt: '2026-08-02T10:00:00.000Z',
    source: ReleaseTargetSource.MANUAL,
    timezone: 'UTC',
    validationIssues: [],
    validationState: TargetValidationState.VALID,
  } as IChannelTarget;
}

describe('ReleaseEngagementRules', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.create.mockResolvedValue({ id: 'rule-2' });
    rulesState.rules = [
      {
        actionPayload: { channels: [] },
        actionType: EngagementRuleAction.REPOST,
        id: 'rule-1',
        isEnabled: true,
        lastError: 'Credential cannot write reposts.',
        metric: EngagementMetric.LIKES,
        metricSnapshot: {
          comments: 4,
          engagementRate: 0.12,
          likes: 120,
          shares: 3,
          views: 900,
        },
        mode: EngagementRuleMode.APPROVAL,
        organizationId: 'org-1',
        postGroupId: 'release-1',
        resultingReleaseId: 'release-2',
        state: EngagementRuleState.TRIGGERED,
        targetId: 'target-1',
        threshold: 100,
        triggeredAt: '2026-08-02T12:00:00.000Z',
        userId: 'user-1',
      } as IEngagementRule,
    ];
  });

  it('lists existing rules with state, lastError, and trigger history', () => {
    render(
      <ReleaseEngagementRules
        postGroupId="release-1"
        reconnectHref="/acme/brand/settings/social"
        target={target()}
      />,
    );

    expect(screen.getByText('Automation')).toBeVisible();
    expect(screen.getByText(EngagementRuleState.TRIGGERED)).toBeVisible();
    expect(screen.getByText('Credential cannot write reposts.')).toBeVisible();
    expect(screen.getByText(/120 likes/)).toBeVisible();
    expect(screen.getByRole('link', { name: 'release-2' })).toHaveAttribute(
      'href',
      '/acme/publishing/calendar?release=release-2',
    );
  });

  it('creates a rule for the target', async () => {
    render(
      <ReleaseEngagementRules
        postGroupId="release-1"
        reconnectHref="/acme/brand/settings/social"
        target={target()}
      />,
    );

    fireEvent.change(screen.getByLabelText('Threshold for instagram'), {
      target: { value: '250' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create rule' }));

    await waitFor(() => {
      expect(mocks.create).toHaveBeenCalledWith({
        actionType: EngagementRuleAction.REPOST,
        isEnabled: true,
        metric: EngagementMetric.LIKES,
        mode: EngagementRuleMode.APPROVAL,
        postGroupId: 'release-1',
        targetId: 'target-1',
        threshold: 250,
      });
    });
  });
});
