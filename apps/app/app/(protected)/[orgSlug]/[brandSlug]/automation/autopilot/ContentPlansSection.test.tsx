import '@testing-library/jest-dom/vitest';
import { ContentPlanStatus } from '@genfeedai/contracts';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ContentPlansSection from './ContentPlansSection';

const mocks = vi.hoisted(() => ({
  error: vi.fn(),
  generate: vi.fn(),
  getSeeds: vi.fn(),
  getWeeklySummary: vi.fn(),
  loggerError: vi.fn(),
  refresh: vi.fn(),
  success: vi.fn(),
  useContentPlans: vi.fn(),
}));

const EMPTY_SEED_PREVIEW = {
  advertisers: [],
  dataset: {
    confidence: 'none',
    genfeedPosts: 0,
    importedPosts: 0,
    totalPosts: 0,
  },
  importedPostCount: 0,
  isColdStart: true,
  patternCount: 0,
  sources: [],
};

vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({
    brandId: 'brand-one',
    isReady: true,
    organizationId: 'org-one',
  }),
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => async () => ({
    generate: mocks.generate,
    getSeeds: mocks.getSeeds,
    getWeeklySummary: mocks.getWeeklySummary,
  }),
}));

vi.mock('@hooks/data/content-plans/use-content-plans', () => ({
  useContentPlans: () => mocks.useContentPlans(),
}));

vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({ href: (path: string) => path }),
}));

vi.mock('@services/analytics/content-performance.service', () => ({
  ContentPerformanceService: { getInstance: vi.fn() },
}));

vi.mock('@services/content/content-plans.service', () => ({
  ContentPlansService: { getInstance: vi.fn() },
}));

vi.mock('@services/core/logger.service', () => ({
  logger: { error: mocks.loggerError },
}));

vi.mock('@services/core/notifications.service', () => ({
  NotificationsService: {
    getInstance: () => ({
      error: mocks.error,
      success: mocks.success,
    }),
  },
}));

vi.mock('@ui/card/Card', () => ({
  default: ({
    children,
    description,
    headerAction,
    label,
  }: {
    children: ReactNode;
    description?: string;
    headerAction?: ReactNode;
    label?: ReactNode;
  }) => (
    <section>
      <h2>{label}</h2>
      <p>{description}</p>
      <div>{headerAction}</div>
      {children}
    </section>
  ),
}));

vi.mock('@ui/display/badge/Badge', () => ({
  default: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}));

vi.mock('@ui/display/table/Table', () => ({
  default: ({
    columns,
    emptyDescription,
    emptyLabel,
    getRowKey,
    items,
  }: {
    columns: Array<{
      header: ReactNode;
      key: string;
      render?: (item: unknown) => ReactNode;
    }>;
    emptyDescription?: string;
    emptyLabel?: string;
    getRowKey: (item: Record<string, unknown>) => string;
    items: Array<Record<string, unknown>>;
  }) => {
    if (items.length === 0) {
      return (
        <div>
          <p>{emptyLabel}</p>
          <p>{emptyDescription}</p>
        </div>
      );
    }

    return (
      <table>
        <tbody>
          {items.map((item) => (
            <tr key={getRowKey(item)}>
              {columns.map((column) => (
                <td key={column.key}>
                  {column.render
                    ? column.render(item)
                    : String(item[column.key])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    );
  },
}));

vi.mock(
  '@ui/analytics/performance-dataset-badge/PerformanceDatasetBadge',
  () => ({
    LOW_CONFIDENCE_STATES: ['none', 'low'],
    default: ({ confidence }: { confidence: string }) => (
      <span>confidence:{confidence}</span>
    ),
  }),
);

vi.mock('@ui/primitives/checkbox', () => ({
  Checkbox: ({
    isChecked,
    label,
    name,
    onCheckedChange,
  }: {
    isChecked?: boolean;
    label?: ReactNode;
    name?: string;
    onCheckedChange?: (checked: boolean) => void;
  }) => (
    <label>
      <input
        type="checkbox"
        aria-label={name}
        checked={isChecked ?? false}
        onChange={(event) => onCheckedChange?.(event.target.checked)}
      />
      {label}
    </label>
  ),
}));

vi.mock('@ui/primitives/collapsible', () => ({
  Collapsible: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  CollapsibleContent: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  CollapsibleTrigger: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
}));

vi.mock('@ui/primitives/switch', () => ({
  Switch: ({
    isChecked,
    label,
    onCheckedChange,
  }: {
    isChecked?: boolean;
    label?: ReactNode;
    onCheckedChange?: (checked: boolean) => void;
  }) => (
    <label>
      <input
        type="checkbox"
        checked={isChecked ?? false}
        onChange={(event) => onCheckedChange?.(event.target.checked)}
      />
      {label}
    </label>
  ),
}));

vi.mock('@ui/primitives/button', () => ({
  Button: ({
    children,
    disabled,
    isDisabled,
    label,
    onClick,
    type = 'button',
  }: {
    children?: ReactNode;
    disabled?: boolean;
    isDisabled?: boolean;
    label?: ReactNode;
    onClick?: () => void;
    type?: 'button' | 'submit';
  }) => (
    <button disabled={disabled || isDisabled} type={type} onClick={onClick}>
      {label ?? children}
    </button>
  ),
}));

vi.mock('@ui/primitives/dialog', () => ({
  Dialog: ({ children, open }: { children: ReactNode; open: boolean }) =>
    open ? <div role="dialog">{children}</div> : null,
  DialogContent: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  DialogDescription: ({ children }: { children: ReactNode }) => (
    <p>{children}</p>
  ),
  DialogFooter: ({ children }: { children: ReactNode }) => (
    <footer>{children}</footer>
  ),
  DialogHeader: ({ children }: { children: ReactNode }) => (
    <header>{children}</header>
  ),
  DialogTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
}));

vi.mock('@ui/primitives/input', () => ({
  Input: ({
    id,
    onChange,
    placeholder,
    type = 'text',
    value,
  }: {
    id?: string;
    onChange?: (event: React.ChangeEvent<HTMLInputElement>) => void;
    placeholder?: string;
    type?: string;
    value?: string;
  }) => (
    <input
      id={id}
      placeholder={placeholder}
      type={type}
      value={value ?? ''}
      onChange={onChange}
    />
  ),
}));

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/org/acme/brand/demo/automation/overview',
}));

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import(
    '../../../../../../tests/next-intl.stub'
  );

  return { useTranslations: translateFromCatalog };
});

function makePlan(overrides: Record<string, unknown> = {}) {
  return {
    description:
      'AI-generated cold-start plan (seeded from competitor ads, creative patterns and followed creators; 3 own posts in the last 30 days): Launch Week',
    executedCount: 0,
    id: 'plan-1',
    itemCount: 7,
    name: 'Launch Week',
    periodEnd: '2026-09-14',
    periodStart: '2026-09-07',
    status: ContentPlanStatus.DRAFT,
    ...overrides,
  };
}

describe('ContentPlansSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.refresh.mockResolvedValue(undefined);
    mocks.generate.mockResolvedValue(undefined);
    mocks.getWeeklySummary.mockResolvedValue({
      dataset: {
        confidence: 'low',
        genfeedPosts: 2,
        importedPosts: 1,
        totalPosts: 3,
      },
    });
    mocks.getSeeds.mockResolvedValue(EMPTY_SEED_PREVIEW);
    mocks.useContentPlans.mockReturnValue({
      isLoading: false,
      plans: [makePlan()],
      refresh: mocks.refresh,
    });
  });

  it('renders plans with a cold-start badge and seed summary', () => {
    render(<ContentPlansSection />);

    expect(screen.getByText('Recent plans')).toBeVisible();
    expect(screen.getByText('Launch Week')).toBeVisible();
    expect(screen.getByText('Cold-start')).toBeVisible();
    expect(
      screen.getByText(
        'seeded from competitor ads, creative patterns and followed creators; 3 own posts in the last 30 days',
      ),
    ).toBeVisible();
  });

  it('badges a grounded plan and shows no plans empty state otherwise', () => {
    mocks.useContentPlans.mockReturnValue({
      isLoading: false,
      plans: [],
      refresh: mocks.refresh,
    });

    render(<ContentPlansSection />);

    expect(screen.getByText('No plans yet')).toBeVisible();
  });

  it('opens the generate dialog, shows the dataset confidence, and submits', async () => {
    render(<ContentPlansSection />);

    fireEvent.click(screen.getByRole('button', { name: /Generate plan now/i }));

    expect(await screen.findByRole('dialog')).toBeVisible();
    await waitFor(() => {
      expect(screen.getByText('confidence:low')).toBeVisible();
    });
    expect(
      screen.getByText(
        'This plan will be seeded from competitor ads, creative patterns and followed creators until this brand has more history.',
      ),
    ).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'Generate plan' }));

    await waitFor(() => {
      expect(mocks.generate).toHaveBeenCalledWith(
        'brand-one',
        expect.objectContaining({
          periodEnd: expect.any(String),
          periodStart: expect.any(String),
        }),
      );
      expect(mocks.success).toHaveBeenCalledWith('Plan generation started');
      expect(mocks.refresh).toHaveBeenCalled();
    });
  });

  it('reports a failure to generate a plan', async () => {
    mocks.generate.mockRejectedValueOnce(new Error('failed'));
    render(<ContentPlansSection />);

    fireEvent.click(screen.getByRole('button', { name: /Generate plan now/i }));
    await screen.findByRole('dialog');
    fireEvent.click(screen.getByRole('button', { name: 'Generate plan' }));

    await waitFor(() => {
      expect(mocks.loggerError).toHaveBeenCalledWith(
        'Failed to generate content plan',
        { error: expect.any(Error) },
      );
      expect(mocks.error).toHaveBeenCalledWith('Failed to generate plan');
    });
  });

  it('shows the seed summary from a structured plan.seeds field over the description', () => {
    mocks.useContentPlans.mockReturnValue({
      isLoading: false,
      plans: [
        makePlan({
          seeds: {
            advertiserIds: ['adv-1', 'adv-2', 'adv-3'],
            isColdStart: false,
            isImportedHistoryIncluded: true,
            isPatternsIncluded: true,
            sourceIds: ['source-1'],
          },
        }),
      ],
      refresh: mocks.refresh,
    });

    render(<ContentPlansSection />);

    expect(screen.getByText('Grounded')).toBeVisible();
    expect(
      screen.getByText('3 advertisers · 1 creator · patterns · own history'),
    ).toBeVisible();
  });

  it('renders the seed picker with advertisers and sources checked by default, drops an unchecked advertiser, and toggles the switches', async () => {
    mocks.getSeeds.mockResolvedValue({
      advertisers: [
        {
          adCount: 3,
          id: 'adv-1',
          name: 'Rival Co',
          platform: 'meta',
          topHeadline: 'Best deal ever',
        },
      ],
      dataset: {
        confidence: 'low',
        genfeedPosts: 0,
        importedPosts: 2,
        totalPosts: 2,
      },
      importedPostCount: 2,
      isColdStart: true,
      patternCount: 4,
      sources: [
        {
          displayName: 'Creator',
          handle: 'creator',
          id: 'source-1',
          platform: 'instagram',
          postCount: 5,
          sourceType: 'account',
        },
        {
          displayName: 'Own',
          handle: 'own',
          id: 'source-own',
          platform: 'instagram',
          postCount: 9,
          sourceType: 'own-account',
        },
      ],
    });

    render(<ContentPlansSection />);
    fireEvent.click(screen.getByRole('button', { name: /Generate plan now/i }));
    await screen.findByRole('dialog');

    const advertiserCheckbox = await screen.findByRole('checkbox', {
      name: 'seed-advertiser-adv-1',
    });
    const sourceCheckbox = screen.getByRole('checkbox', {
      name: 'seed-source-source-1',
    });
    expect(advertiserCheckbox).toBeChecked();
    expect(sourceCheckbox).toBeChecked();
    expect(
      screen.queryByRole('checkbox', { name: 'seed-source-source-own' }),
    ).not.toBeInTheDocument();

    fireEvent.click(advertiserCheckbox);
    expect(advertiserCheckbox).not.toBeChecked();

    const switches = screen
      .getAllByRole('checkbox')
      .filter(
        (element) => !element.getAttribute('aria-label')?.startsWith('seed-'),
      );
    for (const switchInput of switches) {
      fireEvent.click(switchInput);
    }

    fireEvent.click(screen.getByRole('button', { name: 'Generate plan' }));

    await waitFor(() => {
      expect(mocks.generate).toHaveBeenCalledWith(
        'brand-one',
        expect.objectContaining({
          seeds: {
            advertiserIds: [],
            isImportedHistoryIncluded: false,
            isPatternsIncluded: false,
            sourceIds: ['source-1'],
          },
        }),
      );
    });
  });
});
