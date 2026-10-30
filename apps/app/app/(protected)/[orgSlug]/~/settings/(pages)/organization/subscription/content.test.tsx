import Route from '@app/(protected)/[orgSlug]/~/settings/(organization)/subscription/page';
import { Subscription } from '@genfeedai/client/models/billing/subscription.model';
import { SubscriptionStatus, SubscriptionTier } from '@genfeedai/contracts';
import type { IDesktopRuntimeContext } from '@genfeedai/contracts/desktop';
import type { DesktopRuntimeSnapshot } from '@genfeedai/services/core/desktop-runtime.service';
import type { NotificationsService } from '@services/core/notifications.service';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SettingsSubscriptionPage from './content';
import '@testing-library/jest-dom/vitest';
import type { UseSubscriptionReturn } from '@genfeedai/contracts/interfaces/hooks/hooks.interface';

// UpgradePlan renders inside this page, so the catalog-backed stub keeps the
// assertions on real copy without a NextIntlClientProvider.
vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import(
    '../../../../../../../../tests/next-intl.stub'
  );

  return { useTranslations: translateFromCatalog };
});

const useBrandMock = vi.fn();
vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: () => useBrandMock(),
}));

const useSubscriptionMock = vi.fn();
vi.mock('@hooks/data/subscription/use-subscription/use-subscription', () => ({
  useSubscription: () => useSubscriptionMock(),
}));

const useBillingAccountMock = vi.fn();
vi.mock(
  '@/features/settings/hooks/use-billing-account/use-billing-account',
  () => ({
    useBillingAccount: () => useBillingAccountMock(),
  }),
);

const createCheckoutSession = vi.fn();
vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => async () => ({ createCheckoutSession }),
}));
vi.mock('@services/billing/stripe.service', () => ({
  StripeService: { getInstance: vi.fn() },
}));
vi.mock('@services/core/logger.service', () => ({
  logger: { error: vi.fn(), info: vi.fn() },
}));
const notifications = vi.hoisted(() => ({
  error: vi.fn<NotificationsService['error']>(),
  success: vi.fn(),
}));
vi.mock('@services/core/notifications.service', () => ({
  NotificationsService: { getInstance: () => notifications },
}));
vi.mock('@genfeedai/pricing', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@genfeedai/pricing')>();
  return {
    ...actual,
    getPlanByTier: (tier: Parameters<typeof actual.getPlanByTier>[0]) => ({
      ...actual.getPlanByTier(tier),
      stripePriceId: `price_${tier}`,
    }),
  };
});

vi.mock('@tanstack/react-query', () => ({
  useQuery: vi.fn(() => ({
    data: null,
    isLoading: false,
    refetch: vi.fn(),
  })),
}));

const runtime = vi.hoisted(() => vi.fn<() => DesktopRuntimeSnapshot>());
vi.mock(
  '@genfeedai/hooks/ui/use-desktop-runtime-context/use-desktop-runtime-context',
  () => ({ useDesktopRuntimeContext: runtime }),
);
vi.mock('@helpers/media/metadata/page-metadata.helper', () => ({
  createPageMetadata: () => ({}),
}));
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`redirect:${url}`);
  },
}));
const subscriptionCloudContext: IDesktopRuntimeContext = {
  version: 1,
  runtimeId: 'subscription-runtime',
  revision: 1,
  status: 'ready',
  selectedServerId: 'subscription-cloud',
  selectedServerKind: 'cloud',
  selectedApiEndpoint: 'https://example.invalid/v1',
  runtimeMode: 'cloud',
  generationExecution: 'remote',
  localProvider: null,
};
const subscriptionLocalContext: IDesktopRuntimeContext = {
  ...subscriptionCloudContext,
  revision: 2,
  runtimeMode: 'local',
  generationExecution: 'local-byok',
  localProvider: { provider: 'ollama', networkAccess: 'local' },
};

function setSubscription(subscription: UseSubscriptionReturn['subscription']) {
  useSubscriptionMock.mockReturnValue({
    changeSubscriptionPlan: vi.fn(),
    creditsBreakdown: null,
    error: null,
    isLoading: false,
    isSubscriptionActive: subscription?.status === SubscriptionStatus.ACTIVE,
    openBillingPortal: vi.fn(),
    previewPlanChange: vi.fn(),
    refreshCreditsBreakdown: vi.fn(),
    refreshSubscription: vi.fn(),
    subscription,
  } satisfies UseSubscriptionReturn);
}

describe('SettingsSubscriptionPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    runtime.mockReturnValue({ status: 'web', context: null });
    useBrandMock.mockReturnValue({
      isReady: true,
      organizationId: 'org-123',
      settings: { subscriptionTier: 'free' },
    });
    useBillingAccountMock.mockReturnValue({
      account: null,
      error: null,
      isLoading: false,
      refresh: vi.fn(),
    });
    useSubscriptionMock.mockReturnValue({
      changeSubscriptionPlan: vi.fn(),
      creditsBreakdown: null,
      error: null,
      isLoading: false,
      isSubscriptionActive: true,
      openBillingPortal: vi.fn(),
      previewPlanChange: vi.fn(),
      refreshCreditsBreakdown: vi.fn(),
      refreshSubscription: vi.fn(),
      subscription: {
        category: 'pro',
        status: 'active',
      },
    } as UseSubscriptionReturn);
  });

  it('renders plan and limits without credit top-up', () => {
    render(<SettingsSubscriptionPage />);

    expect(screen.getByText('Current Plan')).toBeInTheDocument();
    expect(screen.getByText('Organizations')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Open Billing Portal/i }),
    ).toBeInTheDocument();
    expect(screen.queryByText('Add credits')).not.toBeInTheDocument();
    expect(screen.queryByText('Credits Left')).not.toBeInTheDocument();
  });

  it('puts the upgrade inside the Current Plan card, with no separate Plans section', () => {
    render(<SettingsSubscriptionPage />);

    const portal = screen.getByRole('button', { name: /Open Billing Portal/i });
    const upgrade = screen.getByRole('button', { name: /Upgrade to Scale/i });
    expect(
      portal.compareDocumentPosition(upgrade) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      screen.getByText('Current Plan').closest('[class*="border"]'),
    ).toContainElement(upgrade);
    expect(
      screen.queryByRole('heading', { name: 'Plans' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Manage subscription')).not.toBeInTheDocument();
  });

  it('shows the Scale price and key benefits beside the upgrade button', () => {
    render(<SettingsSubscriptionPage />);

    expect(screen.getByText('$499/mo')).toBeInTheDocument();
    expect(
      screen.getByText('Unlimited seats and client workspaces'),
    ).toBeInTheDocument();
  });

  it.each([SubscriptionTier.SCALE, SubscriptionTier.ENTERPRISE])(
    'offers no upgrade to Scale on the %s plan',
    (subscriptionTier) => {
      useBrandMock.mockReturnValue({
        isReady: true,
        organizationId: 'org-123',
        settings: { subscriptionTier },
      });

      render(<SettingsSubscriptionPage />);

      expect(
        screen.queryByRole('button', { name: /Upgrade to Scale/i }),
      ).not.toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: /Open Billing Portal/i }),
      ).toBeInTheDocument();
    },
  );

  it.each([SubscriptionTier.FREE, 'payg'])(
    'hides the period end on the %s plan, which has no renewal',
    (subscriptionTier) => {
      useBrandMock.mockReturnValue({
        isReady: true,
        organizationId: 'org-123',
        settings: { subscriptionTier },
      });
      setSubscription(
        new Subscription({
          currentPeriodEnd: '2026-11-11T00:00:00.000Z',
          status: SubscriptionStatus.ACTIVE,
          stripeSubscriptionId: 'sub_active_fixture',
        }),
      );

      render(<SettingsSubscriptionPage />);

      expect(screen.queryByText(/Current period ends/)).not.toBeInTheDocument();
    },
  );

  it('names the plan from the organization tier, not the unserialized category', () => {
    // The mocked subscription claims category "pro" while the org tier is
    // "free"; `category` never reaches the client, so the tier wins.
    render(<SettingsSubscriptionPage />);

    expect(screen.getByText('Free')).toBeInTheDocument();
    expect(screen.queryByText('pro')).not.toBeInTheDocument();
  });

  describe('current plan status', () => {
    it.each([undefined, ''])(
      'shows a Free provisioning placeholder as Active without Stripe id %s',
      (stripeSubscriptionId) => {
        setSubscription(
          new Subscription({
            status: SubscriptionStatus.INCOMPLETE,
            stripeSubscriptionId,
          }),
        );

        render(<SettingsSubscriptionPage />);

        expect(screen.getByText('Free')).toBeVisible();
        expect(screen.getByText('Active')).toHaveClass('text-success');
        expect(screen.queryByText('Incomplete')).not.toBeInTheDocument();
      },
    );

    it.each([SubscriptionTier.FREE, null, undefined, ''])(
      'shows the Free plan as Active when tier %s has no subscription row',
      (subscriptionTier) => {
        useBrandMock.mockReturnValue({
          isReady: true,
          organizationId: 'org-123',
          settings: { subscriptionTier },
        });
        setSubscription(null);

        render(<SettingsSubscriptionPage />);

        expect(screen.getByText('Free')).toBeVisible();
        expect(screen.getByText('Active')).toHaveClass('text-success');
        expect(
          screen.queryByText(
            'No active subscription. Subscribe to unlock all features.',
          ),
        ).not.toBeInTheDocument();
      },
    );

    it.each(['FREE', ' free ', 'monthly'])(
      'shows an unmapped tier %j as the Free plan, Active without Stripe id',
      (subscriptionTier) => {
        useBrandMock.mockReturnValue({
          isReady: true,
          organizationId: 'org-123',
          settings: { subscriptionTier },
        });
        setSubscription(
          new Subscription({ status: SubscriptionStatus.INCOMPLETE }),
        );

        render(<SettingsSubscriptionPage />);

        expect(screen.getByText('Free')).toBeVisible();
        expect(screen.getByText('Active')).toHaveClass('text-success');
        expect(screen.queryByText('Incomplete')).not.toBeInTheDocument();
      },
    );

    it.each([SubscriptionTier.FREE, SubscriptionTier.SCALE])(
      'preserves a genuine incomplete Stripe subscription on tier %s',
      (subscriptionTier) => {
        useBrandMock.mockReturnValue({
          isReady: true,
          organizationId: 'org-123',
          settings: { subscriptionTier },
        });
        setSubscription(
          new Subscription({
            currentPeriodEnd: '2026-11-01T00:00:00.000Z',
            status: SubscriptionStatus.INCOMPLETE,
            stripeSubscriptionId: 'sub_incomplete_fixture',
          }),
        );

        render(<SettingsSubscriptionPage />);

        expect(screen.getByText('Incomplete')).toHaveClass('text-warning');
        expect(screen.queryByText('Active')).not.toBeInTheDocument();
      },
    );

    it('shows the period end on the Scale plan', () => {
      useBrandMock.mockReturnValue({
        isReady: true,
        organizationId: 'org-123',
        settings: { subscriptionTier: SubscriptionTier.SCALE },
      });
      setSubscription(
        new Subscription({
          currentPeriodEnd: '2026-11-01T00:00:00.000Z',
          status: SubscriptionStatus.ACTIVE,
          stripeSubscriptionId: 'sub_scale_fixture',
        }),
      );

      render(<SettingsSubscriptionPage />);

      expect(screen.getByText(/Current period ends/)).toBeVisible();
    });

    it.each([SubscriptionTier.SCALE, SubscriptionTier.ENTERPRISE])(
      'does not promote a paid %s placeholder to Active',
      (subscriptionTier) => {
        useBrandMock.mockReturnValue({
          isReady: true,
          organizationId: 'org-123',
          settings: { subscriptionTier },
        });
        setSubscription(
          new Subscription({ status: SubscriptionStatus.INCOMPLETE }),
        );

        render(<SettingsSubscriptionPage />);

        expect(screen.getByText('Incomplete')).toBeVisible();
        expect(screen.queryByText('Active')).not.toBeInTheDocument();
      },
    );

    it.each([SubscriptionTier.SCALE, SubscriptionTier.ENTERPRISE])(
      'keeps the existing no-subscription state for paid tier %s',
      (subscriptionTier) => {
        useBrandMock.mockReturnValue({
          isReady: true,
          organizationId: 'org-123',
          settings: { subscriptionTier },
        });
        setSubscription(null);

        render(<SettingsSubscriptionPage />);

        expect(
          screen.getByText(
            'No active subscription. Subscribe to unlock all features.',
          ),
        ).toBeVisible();
        expect(screen.queryByText('Active')).not.toBeInTheDocument();
      },
    );

    it('updates the Free display when a real Stripe subscription arrives', () => {
      const placeholder = new Subscription({
        status: SubscriptionStatus.INCOMPLETE,
      });
      setSubscription(placeholder);
      const { rerender } = render(<SettingsSubscriptionPage />);

      expect(screen.getByText('Active')).toBeVisible();
      expect(placeholder.status).toBe(SubscriptionStatus.INCOMPLETE);

      setSubscription(
        new Subscription({
          status: SubscriptionStatus.INCOMPLETE,
          stripeSubscriptionId: 'sub_incomplete_fixture',
        }),
      );
      rerender(<SettingsSubscriptionPage />);

      expect(screen.getByText('Incomplete')).toHaveClass('text-warning');
      expect(screen.queryByText('Active')).not.toBeInTheDocument();
    });

    it.each([
      [SubscriptionStatus.CANCELLED, 'Cancelled'],
      [SubscriptionStatus.PAST_DUE, 'Past Due'],
      [SubscriptionStatus.TRIALING, 'Trialing'],
      [SubscriptionStatus.PAUSED, 'Paused'],
    ] satisfies [SubscriptionStatus, string][])(
      'preserves the recorded %s lifecycle',
      (status, label) => {
        setSubscription(new Subscription({ status }));

        render(<SettingsSubscriptionPage />);

        expect(screen.getByText(label)).toBeVisible();
        expect(screen.queryByText('Active')).not.toBeInTheDocument();
      },
    );
  });

  it('renders section chrome immediately while the subscription query loads', () => {
    useSubscriptionMock.mockReturnValue({
      changeSubscriptionPlan: vi.fn(),
      creditsBreakdown: null,
      error: null,
      isLoading: true,
      isSubscriptionActive: false,
      openBillingPortal: vi.fn(),
      previewPlanChange: vi.fn(),
      refreshCreditsBreakdown: vi.fn(),
      refreshSubscription: vi.fn(),
      subscription: null,
    } as UseSubscriptionReturn);

    render(<SettingsSubscriptionPage />);

    // Chrome: section headers render unconditionally while data loads.
    expect(screen.getByText('Current Plan')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Open Billing Portal/i }),
    ).toBeInTheDocument();

    // Stat tiles show a placeholder rather than blocking the whole page.
    expect(screen.getByText('Organizations')).toBeInTheDocument();
    expect(screen.queryByText('Active')).not.toBeInTheDocument();
    expect(
      screen.queryByText(
        'No active subscription. Subscribe to unlock all features.',
      ),
    ).not.toBeInTheDocument();
  });

  it('renders section chrome immediately while the brand context is not ready', () => {
    useBrandMock.mockReturnValue({
      isReady: false,
      organizationId: undefined,
      settings: undefined,
    });

    render(<SettingsSubscriptionPage />);

    expect(screen.getByText('Current Plan')).toBeInTheDocument();
    expect(screen.getAllByText('-').length).toBeGreaterThan(0);
    expect(screen.queryByText('Active')).not.toBeInTheDocument();
  });

  it('renders the full billing account snapshot, including the wallet and funded organizations', () => {
    useBillingAccountMock.mockReturnValue({
      account: {
        callerRole: 'VIEWER',
        capabilities: {
          canCheckout: false,
          canDetachOrganization: false,
          canLinkOrganization: false,
          canManageBudgets: false,
          canManageMembers: false,
          canOpenPortal: false,
        },
        isIdentityStale: false,
        kind: 'account',
        linkedOrganizations: [
          { label: 'Acme', organizationId: 'org-123', usage: 42 },
        ],
        status: 'active',
        wallet: { available: 100, held: 10, settled: 110 },
      },
      error: null,
      isLoading: false,
      refresh: vi.fn(),
    });

    render(<SettingsSubscriptionPage />);

    expect(screen.getByText('Available')).toBeInTheDocument();
    expect(screen.getByText('100')).toBeInTheDocument();
    expect(screen.getByText('Funded organizations')).toBeInTheDocument();
    expect(screen.getByText('Acme')).toBeInTheDocument();
  });

  it('renders the reduced own-organization view without wallet or other orgs, and without crashing', () => {
    useBillingAccountMock.mockReturnValue({
      account: {
        budgetPolicy: null,
        callerRole: null,
        capabilities: {
          canCheckout: false,
          canDetachOrganization: false,
          canLinkOrganization: false,
          canManageBudgets: false,
          canManageMembers: false,
          canOpenPortal: false,
        },
        isLinked: true,
        id: 'billing-account-123',
        kind: 'organization',
        monthlyBudgetCredits: null,
        organizationId: 'org-123',
        usage: 7,
      },
      error: null,
      isLoading: false,
      refresh: vi.fn(),
    });

    render(<SettingsSubscriptionPage />);

    expect(screen.getByText('Current Plan')).toBeInTheDocument();
    expect(
      screen.getByText('Linked to a shared billing account'),
    ).toBeInTheDocument();
    expect(screen.getByText('Linked')).toBeInTheDocument();
    expect(screen.getByText("This organization's usage")).toBeInTheDocument();
    expect(screen.getByText('7')).toBeInTheDocument();
    expect(screen.queryByText('Available')).not.toBeInTheDocument();
    expect(screen.queryByText('Funded organizations')).not.toBeInTheDocument();
  });
  describe('Subscription runtime boundary', () => {
    beforeEach(() => {
      vi.stubEnv('GENFEED_CLOUD', 'true');
      vi.stubEnv('NEXT_PUBLIC_GENFEED_CLOUD', 'true');
      vi.stubEnv('NEXT_PUBLIC_DESKTOP_SHELL', 'false');
      vi.stubEnv('NEXT_PUBLIC_GENFEED_LICENSE_KEY', '');
      vi.stubGlobal(
        'fetch',
        vi.fn(() => {
          throw new Error('Unexpected fetch');
        }),
      );
      vi.stubGlobal(
        'XMLHttpRequest',
        class {
          constructor() {
            throw new Error('Unexpected XHR');
          }
        },
      );
      vi.stubGlobal(
        'WebSocket',
        class {
          constructor() {
            throw new Error('Unexpected WebSocket');
          }
        },
      );
      vi.stubGlobal(
        'open',
        vi.fn(() => {
          throw new Error('Unexpected browser open');
        }),
      );
    });
    it('withholds billing in a local renderer after the hosted server admits the route', async () => {
      const element = await Route({
        params: Promise.resolve({ orgSlug: 'acme' }),
      });
      vi.stubGlobal('__GENFEED_RUNTIME_CONFIG__', { clientSurface: 'desktop' });
      runtime.mockReturnValue({
        status: 'ready',
        context: subscriptionLocalContext,
      });
      render(element);
      expect(
        screen.queryByRole('button', { name: 'Open Billing Portal' }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: 'Upgrade to Scale' }),
      ).not.toBeInTheDocument();
      expect(useSubscriptionMock).not.toHaveBeenCalled();
      expect(useBillingAccountMock).not.toHaveBeenCalled();
    });
    it.each([
      ['cloud web', 'true', 'false', '', { status: 'web', context: null }],
      [
        'licensed self-host web',
        'false',
        'false',
        'cosmetic-test-only',
        { status: 'web', context: null },
      ],
      [
        'cloud desktop',
        'true',
        'false',
        '',
        { status: 'ready', context: subscriptionCloudContext },
      ],
      [
        'licensed self-host desktop',
        'false',
        'true',
        'cosmetic-test-only',
        {
          status: 'ready',
          context: {
            ...subscriptionCloudContext,
            selectedServerKind: 'self-hosted',
          },
        },
      ],
      [
        'unknown execution',
        'false',
        'true',
        'cosmetic-test-only',
        {
          status: 'ready',
          context: {
            ...subscriptionCloudContext,
            selectedServerKind: 'self-hosted',
            generationExecution: 'unknown',
          },
        },
      ],
    ] satisfies [string, string, string, string, DesktopRuntimeSnapshot][])(
      'preserves the admitted route for %s',
      async (_name, cloud, desktop, license, snapshot) => {
        vi.stubEnv('GENFEED_CLOUD', cloud);
        vi.stubEnv('NEXT_PUBLIC_GENFEED_CLOUD', cloud);
        vi.stubEnv('NEXT_PUBLIC_DESKTOP_SHELL', desktop);
        vi.stubEnv('NEXT_PUBLIC_GENFEED_LICENSE_KEY', license);
        runtime.mockReturnValue(snapshot);
        const element = await Route({
          params: Promise.resolve({ orgSlug: 'acme' }),
        });
        if (snapshot.status !== 'web')
          vi.stubGlobal('__GENFEED_RUNTIME_CONFIG__', {
            clientSurface: 'desktop',
          });
        render(element);
        expect(
          screen.getByRole('button', { name: 'Open Billing Portal' }),
        ).toBeVisible();
        expect(
          screen.getByRole('button', { name: 'Upgrade to Scale' }),
        ).toBeVisible();
        expect(useSubscriptionMock).toHaveBeenCalledTimes(2);
        expect(useBillingAccountMock).toHaveBeenCalledTimes(1);
      },
    );
    it.each([
      ['local Ollama', { status: 'ready', context: subscriptionLocalContext }],
      [
        'remote BYOK',
        {
          status: 'ready',
          context: {
            ...subscriptionLocalContext,
            localProvider: { provider: 'replicate', networkAccess: 'remote' },
          },
        },
      ],
      [
        'unknown local execution',
        {
          status: 'ready',
          context: {
            ...subscriptionLocalContext,
            generationExecution: 'unknown',
            localProvider: null,
          },
        },
      ],
      ['loading', { status: 'loading', context: null }],
      ['unavailable', { status: 'unavailable', context: null }],
      [
        'switching from cloud',
        { status: 'switching', context: subscriptionCloudContext },
      ],
      [
        'switching from local',
        { status: 'switching', context: subscriptionLocalContext },
      ],
    ] satisfies [string, DesktopRuntimeSnapshot][])(
      'renders a neutral unavailable state for %s even with a cosmetic license hint',
      async (_name, snapshot) => {
        vi.stubEnv('NEXT_PUBLIC_GENFEED_LICENSE_KEY', 'cosmetic-test-only');
        runtime.mockReturnValue(snapshot);
        render(await Route({ params: Promise.resolve({ orgSlug: 'acme' }) }));
        expect(
          screen.getByRole('heading', { name: 'Subscription' }),
        ).toHaveClass('sr-only');
        expect(screen.getByText('Subscription unavailable')).toBeVisible();
        expect(
          screen.getByText(
            'Subscription is unavailable for the current runtime.',
          ),
        ).toBeVisible();
        expect(screen.queryByRole('button')).not.toBeInTheDocument();
        expect(screen.queryByRole('link')).not.toBeInTheDocument();
        expect(
          screen.queryByRole('button', { name: 'Upgrade to Scale' }),
        ).not.toBeInTheDocument();
        expect(screen.queryByText('Billing account')).not.toBeInTheDocument();
        expect(useSubscriptionMock).not.toHaveBeenCalled();
        expect(useBillingAccountMock).not.toHaveBeenCalled();
      },
    );
    it.each(['community web', 'unlicensed bundled desktop'])(
      'keeps the server redirect for %s before any billing hook',
      async (name) => {
        vi.stubEnv('GENFEED_CLOUD', 'false');
        vi.stubEnv('NEXT_PUBLIC_GENFEED_CLOUD', 'false');
        vi.stubEnv(
          'NEXT_PUBLIC_DESKTOP_SHELL',
          name === 'unlicensed bundled desktop' ? 'true' : 'false',
        );
        await expect(
          Route({ params: Promise.resolve({ orgSlug: 'acme' }) }),
        ).rejects.toThrow('redirect:/acme/~/settings/credits');
        expect(useSubscriptionMock).not.toHaveBeenCalled();
        expect(useBillingAccountMock).not.toHaveBeenCalled();
      },
    );
    it('preserves direct community web content behind the server-owned hint guard', () => {
      vi.stubEnv('GENFEED_CLOUD', 'false');
      vi.stubEnv('NEXT_PUBLIC_GENFEED_CLOUD', 'false');
      render(<SettingsSubscriptionPage />);
      expect(
        screen.getByRole('button', { name: 'Upgrade to Scale' }),
      ).toBeVisible();
    });
    it.each(['cloud', 'self-hosted'] as const)(
      'mounts and removes the data child through same-instance %s transitions',
      (selectedServerKind) => {
        const cloud: IDesktopRuntimeContext = {
          ...subscriptionCloudContext,
          selectedServerKind,
        };
        const transitions: [DesktopRuntimeSnapshot, boolean][] = [
          [{ status: 'loading', context: null }, false],
          [{ status: 'web', context: null }, true],
          [{ status: 'ready', context: cloud }, true],
          [{ status: 'switching', context: cloud }, false],
          [{ status: 'ready', context: subscriptionLocalContext }, false],
          [{ status: 'ready', context: cloud }, true],
          [{ status: 'unavailable', context: null }, false],
          [{ status: 'ready', context: cloud }, true],
          [{ status: 'ready', context: subscriptionLocalContext }, false],
          [{ status: 'ready', context: cloud }, true],
        ];
        vi.stubEnv('NEXT_PUBLIC_GENFEED_LICENSE_KEY', 'cosmetic-test-only');
        if (selectedServerKind === 'self-hosted') {
          vi.stubEnv('GENFEED_CLOUD', 'false');
          vi.stubEnv('NEXT_PUBLIC_GENFEED_CLOUD', 'false');
        }
        useBillingAccountMock.mockReturnValue({
          account: {
            kind: 'account',
            status: 'active',
            isIdentityStale: false,
            capabilities: { canOpenPortal: true },
            wallet: { available: 100, held: 10, settled: 110 },
            linkedOrganizations: [],
          },
        });
        runtime.mockReturnValue({ status: 'loading', context: null });
        const { rerender } = render(<SettingsSubscriptionPage />);
        for (const [snapshot, allowed] of transitions) {
          useSubscriptionMock.mockClear();
          useBillingAccountMock.mockClear();
          runtime.mockReturnValue(snapshot);
          rerender(<SettingsSubscriptionPage />);
          expect(
            Boolean(screen.queryByRole('button', { name: 'Upgrade to Scale' })),
          ).toBe(allowed);
          expect(Boolean(screen.queryByText('Billing account'))).toBe(allowed);
          expect(
            Boolean(
              screen.queryByRole('button', { name: 'Open Billing Portal' }),
            ),
          ).toBe(allowed);
          if (allowed) {
            expect(useSubscriptionMock).toHaveBeenCalled();
            expect(useBillingAccountMock).toHaveBeenCalled();
          } else {
            expect(screen.getByText('Subscription unavailable')).toBeVisible();
            expect(useSubscriptionMock).not.toHaveBeenCalled();
            expect(useBillingAccountMock).not.toHaveBeenCalled();
          }
        }
      },
    );
    it('cancels an already scheduled upgrade retry when runtime denial unmounts it', async () => {
      const previewPlanChange = vi.fn().mockRejectedValue({
        response: {
          data: {
            errors: [
              {
                code: 'billing_provider_unavailable',
                meta: {
                  isRetryable: true,
                  maxRetries: 1,
                  retryAfterSeconds: 30,
                },
              },
            ],
          },
        },
      });
      useSubscriptionMock.mockReturnValue({
        subscription: { stripeSubscriptionId: 'sub_fixture', status: 'active' },
        isLoading: false,
        isSubscriptionActive: true,
        openBillingPortal: vi.fn(),
        previewPlanChange,
        changeSubscriptionPlan: vi.fn(),
      });
      runtime.mockReturnValue({
        status: 'ready',
        context: subscriptionCloudContext,
      });
      const { rerender } = render(<SettingsSubscriptionPage />);
      fireEvent.click(screen.getByRole('button', { name: 'Upgrade to Scale' }));
      await waitFor(() => expect(notifications.error).toHaveBeenCalledTimes(1));
      const retry = notifications.error.mock.calls[0]?.[1]?.onAction;
      expect(retry).toBeTypeOf('function');
      vi.useFakeTimers();
      try {
        act(() => retry?.());
        expect(vi.getTimerCount()).toBeGreaterThan(0);
        useSubscriptionMock.mockClear();
        useBillingAccountMock.mockClear();
        runtime.mockReturnValue({
          status: 'ready',
          context: subscriptionLocalContext,
        });
        rerender(<SettingsSubscriptionPage />);
        expect(
          screen.queryByRole('button', { name: 'Upgrade to Scale' }),
        ).not.toBeInTheDocument();
        expect(useSubscriptionMock).not.toHaveBeenCalled();
        expect(useBillingAccountMock).not.toHaveBeenCalled();
        await act(() => vi.advanceTimersByTimeAsync(35_000));
        expect(previewPlanChange).toHaveBeenCalledTimes(1);
        expect(createCheckoutSession).not.toHaveBeenCalled();
      } finally {
        vi.useRealTimers();
      }
    });
  });
});
