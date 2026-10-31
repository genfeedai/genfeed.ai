import { SubscriptionStatus } from '@genfeedai/contracts';
import type { ICreditsBreakdown } from '@genfeedai/contracts/interfaces';
import { useQueryClient } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockUseAuthIdentity = vi.fn();
const mockUseBrand = vi.fn();
const mockShouldShowCreditsNav = vi.fn(() => true);
const mockHasOrganizationBillingHint = vi.fn(() => true);

vi.mock('@hooks/auth/use-auth-identity/use-auth-identity', () => ({
  useAuthIdentity: () => mockUseAuthIdentity(),
}));

vi.mock('@genfeedai/contexts/user/brand-context/brand-context', () => ({
  useBrand: () => mockUseBrand(),
}));

vi.mock('@genfeedai/config/license', () => ({
  hasOrganizationBillingHint: () => mockHasOrganizationBillingHint(),
  shouldShowCreditsNav: () => mockShouldShowCreditsNav(),
}));

// Mock useAuthedService
const mockSubscriptionsService = {
  changeSubscriptionPlan: vi.fn(),
  getCreditsBreakdown: vi.fn(),
};

const mockStripeService = {
  getPortalUrl: vi.fn(),
};

const mockOrganizationsService = {
  findOrganizationSubscription: vi.fn(),
};

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: vi.fn((factory: (token: string) => unknown) => {
    const factoryStr = factory.toString();
    if (factoryStr.includes('SubscriptionsService')) {
      return async () => mockSubscriptionsService;
    }
    if (factoryStr.includes('StripeService')) {
      return async () => mockStripeService;
    }
    if (factoryStr.includes('OrganizationsService')) {
      return async () => mockOrganizationsService;
    }
    return async () => ({});
  }),
}));

vi.mock('@genfeedai/services/billing/stripe.service', () => ({
  StripeService: {
    getInstance: vi.fn(() => mockStripeService),
  },
}));

vi.mock('@genfeedai/services/billing/subscriptions.service', () => ({
  SubscriptionsService: {
    getInstance: vi.fn(() => mockSubscriptionsService),
  },
}));

vi.mock('@genfeedai/services/organization/organizations.service', () => ({
  OrganizationsService: {
    getInstance: vi.fn(() => mockOrganizationsService),
  },
}));

vi.mock('@genfeedai/services/core/logger.service', () => ({
  logger: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

const mockNotificationsService = vi.hoisted(() => ({
  error: vi.fn(),
  info: vi.fn(),
  success: vi.fn(),
}));

vi.mock('@genfeedai/services/core/notifications.service', () => ({
  NotificationsService: {
    getInstance: vi.fn(() => mockNotificationsService),
  },
}));

import { createQueryWrapper } from '@hooks/tests/query-wrapper';
import { useSubscription } from '@/hooks/data/subscription/use-subscription/use-subscription';

describe('useSubscription', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockShouldShowCreditsNav.mockReturnValue(true);
    mockHasOrganizationBillingHint.mockReturnValue(true);
    mockUseAuthIdentity.mockReturnValue({ userId: 'user-123' });
    mockUseBrand.mockReturnValue({ organizationId: 'org-123' });
    mockOrganizationsService.findOrganizationSubscription.mockResolvedValue({
      status: SubscriptionStatus.ACTIVE,
    });
    mockSubscriptionsService.getCreditsBreakdown.mockResolvedValue({
      available: 100,
      total: 200,
      used: 100,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('initialization', () => {
    it('should return subscription data', async () => {
      const { result } = renderHook(() => useSubscription(), {
        wrapper: createQueryWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current).toBeDefined();
      expect(result.current.subscription).toBeDefined();
    });

    it('should return loading state', () => {
      const { result } = renderHook(() => useSubscription(), {
        wrapper: createQueryWrapper(),
      });

      expect(typeof result.current.isLoading).toBe('boolean');
    });

    it('should return creditsBreakdown', async () => {
      const { result } = renderHook(() => useSubscription(), {
        wrapper: createQueryWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.creditsBreakdown).toBeDefined();
    });

    it('still fetches credit breakdown without an active subscription when the credits wallet is shown', async () => {
      mockOrganizationsService.findOrganizationSubscription.mockResolvedValueOnce(
        null,
      );

      const { result } = renderHook(() => useSubscription(), {
        wrapper: createQueryWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.subscription).toBeNull();
      expect(result.current.creditsBreakdown).toEqual({
        available: 100,
        total: 200,
        used: 100,
      });
      expect(mockSubscriptionsService.getCreditsBreakdown).toHaveBeenCalled();
    });

    it('keeps concurrent community wallet consumers from requesting local subscription credits', async () => {
      mockHasOrganizationBillingHint.mockReturnValue(false);
      const { result } = renderHook(
        () => [useSubscription(), useSubscription(), useSubscription()],
        { wrapper: createQueryWrapper() },
      );
      await waitFor(() => {
        for (const consumer of result.current) {
          expect(consumer.isLoading).toBe(false);
        }
      });

      await act(async () => {
        await Promise.all(
          result.current.map((consumer) => consumer.refreshCreditsBreakdown()),
        );
      });

      for (const consumer of result.current) {
        expect(consumer.creditsBreakdown).toBeNull();
        expect(consumer.error).toBeNull();
      }
      expect(
        mockSubscriptionsService.getCreditsBreakdown,
      ).not.toHaveBeenCalled();
    });

    it('shares cloud ledger usage and refreshes between concurrent wallet consumers', async () => {
      mockOrganizationsService.findOrganizationSubscription.mockResolvedValue(
        null,
      );
      const initial = {
        credits: [],
        cycleUsed: 40,
        planLimit: 300,
        total: 500,
      } satisfies ICreditsBreakdown;
      const refreshed = { ...initial, cycleUsed: 80, total: 460 };
      mockSubscriptionsService.getCreditsBreakdown.mockResolvedValue(initial);
      const { result } = renderHook(
        () => [useSubscription(), useSubscription()],
        { wrapper: createQueryWrapper() },
      );
      await waitFor(() => {
        for (const consumer of result.current) {
          expect(consumer.creditsBreakdown).toEqual(initial);
        }
      });
      expect(
        mockSubscriptionsService.getCreditsBreakdown,
      ).toHaveBeenCalledTimes(1);

      mockSubscriptionsService.getCreditsBreakdown.mockResolvedValue(refreshed);
      await act(async () => {
        await result.current[0].refreshCreditsBreakdown();
      });

      await waitFor(() => {
        for (const consumer of result.current) {
          expect(consumer.creditsBreakdown).toEqual(refreshed);
          expect(consumer.error).toBeNull();
        }
      });
      expect(
        mockSubscriptionsService.getCreditsBreakdown,
      ).toHaveBeenCalledTimes(2);
    });

    it.each([null, { status: SubscriptionStatus.ACTIVE }])(
      'does not request community credit breakdowns across mounts and refreshes (%j)',
      async (subscription) => {
        mockHasOrganizationBillingHint.mockReturnValue(false);
        mockOrganizationsService.findOrganizationSubscription.mockResolvedValue(
          subscription,
        );
        const wrapper = createQueryWrapper();
        const firstMount = renderHook(() => useSubscription(), { wrapper });

        await waitFor(() => {
          expect(firstMount.result.current.isLoading).toBe(false);
          expect(
            mockOrganizationsService.findOrganizationSubscription,
          ).toHaveBeenCalled();
        });
        expect(
          mockSubscriptionsService.getCreditsBreakdown,
        ).not.toHaveBeenCalled();

        await act(async () => {
          await firstMount.result.current.refreshCreditsBreakdown();
          await firstMount.result.current.refreshSubscription();
        });
        firstMount.unmount();

        const secondMount = renderHook(() => useSubscription(), { wrapper });
        await waitFor(() => {
          expect(secondMount.result.current.isLoading).toBe(false);
        });
        await act(async () => {
          await secondMount.result.current.refreshCreditsBreakdown();
        });

        expect(secondMount.result.current.creditsBreakdown).toBeNull();
        expect(secondMount.result.current.error).toBeNull();
        expect(
          mockSubscriptionsService.getCreditsBreakdown,
        ).not.toHaveBeenCalled();
      },
    );

    it('does not request community credits when a caller forces the cached query to fetch', async () => {
      mockHasOrganizationBillingHint.mockReturnValue(false);
      const { result } = renderHook(
        () => ({
          queryClient: useQueryClient(),
          subscription: useSubscription(),
        }),
        { wrapper: createQueryWrapper() },
      );
      await waitFor(() => {
        expect(result.current.subscription.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.queryClient.fetchQuery({
          queryKey: ['credits-breakdown', 'org-123', 'user-123'],
        });
      });

      expect(
        mockSubscriptionsService.getCreditsBreakdown,
      ).not.toHaveBeenCalled();
      expect(result.current.subscription.creditsBreakdown).toBeNull();
      expect(result.current.subscription.error).toBeNull();
    });

    it.each([null, { status: SubscriptionStatus.TRIALING }])(
      'keeps billing-enabled wallet reads and refreshes without an active plan (%j)',
      async (subscription) => {
        mockOrganizationsService.findOrganizationSubscription.mockResolvedValue(
          subscription,
        );
        const { result } = renderHook(() => useSubscription(), {
          wrapper: createQueryWrapper(),
        });
        await waitFor(() => {
          expect(result.current.creditsBreakdown?.total).toBe(200);
        });

        mockSubscriptionsService.getCreditsBreakdown.mockResolvedValue({
          total: 150,
        });
        await act(async () => {
          await result.current.refreshCreditsBreakdown();
        });

        await waitFor(() => {
          expect(result.current.creditsBreakdown?.total).toBe(150);
        });
        expect(
          mockSubscriptionsService.getCreditsBreakdown,
        ).toHaveBeenCalledTimes(2);
      },
    );

    it('keeps a previous organization response from replacing the current credit breakdown', async () => {
      const previousBalance =
        Promise.withResolvers<Pick<ICreditsBreakdown, 'total'>>();
      mockSubscriptionsService.getCreditsBreakdown.mockReturnValueOnce(
        previousBalance.promise,
      );
      const { result, rerender } = renderHook(() => useSubscription(), {
        wrapper: createQueryWrapper(),
      });
      await waitFor(() => {
        expect(
          mockSubscriptionsService.getCreditsBreakdown,
        ).toHaveBeenCalledTimes(1);
      });

      mockUseBrand.mockReturnValue({ organizationId: 'org-456' });
      mockSubscriptionsService.getCreditsBreakdown.mockResolvedValue({
        total: 300,
      });
      rerender();

      await waitFor(() => {
        expect(result.current.creditsBreakdown?.total).toBe(300);
      });
      await act(async () => {
        previousBalance.resolve({ total: 200 });
        await previousBalance.promise;
      });
      expect(result.current.creditsBreakdown?.total).toBe(300);
      expect(
        mockSubscriptionsService.getCreditsBreakdown,
      ).toHaveBeenCalledTimes(2);
    });

    it('does not fetch credit breakdown when neither subscription nor credits nav applies', async () => {
      mockShouldShowCreditsNav.mockReturnValue(false);
      mockOrganizationsService.findOrganizationSubscription.mockResolvedValueOnce(
        null,
      );

      const { result } = renderHook(() => useSubscription(), {
        wrapper: createQueryWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.subscription).toBeNull();
      expect(result.current.creditsBreakdown).toBeNull();
      expect(
        mockSubscriptionsService.getCreditsBreakdown,
      ).not.toHaveBeenCalled();
    });

    it('should return error state', async () => {
      const { result } = renderHook(() => useSubscription(), {
        wrapper: createQueryWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.error).toBeNull();
    });

    it.each([
      new Error('Balance unavailable'),
      ...[401, 403, 404, 500, 502, 503, 504].map((status) => ({
        errors: [
          {
            detail: `Balance request failed (${status})`,
            status: String(status),
          },
        ],
      })),
    ])(
      'exposes a failed balance read and clears it after retry (%j)',
      async (failure) => {
        mockSubscriptionsService.getCreditsBreakdown.mockRejectedValue(failure);
        const { result } = renderHook(() => useSubscription(), {
          wrapper: createQueryWrapper(),
        });

        await waitFor(() => expect(result.current.error).toBeTruthy());
        expect(result.current.creditsBreakdown).toBeNull();

        mockSubscriptionsService.getCreditsBreakdown.mockResolvedValue({
          total: 500,
        });
        await act(async () => {
          await result.current.refreshCreditsBreakdown();
        });

        await waitFor(() => {
          expect(result.current.error).toBeNull();
          expect(result.current.creditsBreakdown).toEqual({ total: 500 });
        });
      },
    );

    it('should return isSubscriptionActive', async () => {
      const { result } = renderHook(() => useSubscription(), {
        wrapper: createQueryWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(typeof result.current.isSubscriptionActive).toBe('boolean');
    });
  });

  describe('subscription status', () => {
    it('should set isSubscriptionActive to true when subscription is active', async () => {
      const { result } = renderHook(() => useSubscription(), {
        wrapper: createQueryWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.isSubscriptionActive).toBe(true);
    });

    it('should set isSubscriptionActive to false when no user', async () => {
      mockUseAuthIdentity.mockReturnValueOnce({ userId: null });
      mockUseBrand.mockReturnValueOnce({ organizationId: null });

      const { result } = renderHook(() => useSubscription(), {
        wrapper: createQueryWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // With no user, organization ID won't be set — subscription stays null
      expect(result.current.subscription).toBeNull();
    });
  });

  describe('openBillingPortal', () => {
    it('should be a function', () => {
      const { result } = renderHook(() => useSubscription(), {
        wrapper: createQueryWrapper(),
      });

      expect(typeof result.current.openBillingPortal).toBe('function');
    });

    it('should call stripe service to get portal URL', async () => {
      const mockUrl = 'https://billing.stripe.com/portal';
      mockStripeService.getPortalUrl.mockResolvedValue({ url: mockUrl });

      const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);

      const { result } = renderHook(() => useSubscription(), {
        wrapper: createQueryWrapper(),
      });
      await result.current.openBillingPortal();

      await waitFor(() => {
        expect(openSpy).toHaveBeenCalledWith(mockUrl, '_blank');
      });

      openSpy.mockRestore();
    });

    it('should show error notification on failure', async () => {
      mockStripeService.getPortalUrl.mockRejectedValue(new Error('Failed'));

      const { result } = renderHook(() => useSubscription(), {
        wrapper: createQueryWrapper(),
      });
      await result.current.openBillingPortal();

      await waitFor(() => {
        expect(mockNotificationsService.error).toHaveBeenCalledWith(
          'Failed to open billing portal',
        );
      });
    });
  });

  describe('changeSubscriptionPlan', () => {
    it('should be a function', () => {
      const { result } = renderHook(() => useSubscription(), {
        wrapper: createQueryWrapper(),
      });

      expect(typeof result.current.changeSubscriptionPlan).toBe('function');
    });

    it('should call subscriptions service to change plan', async () => {
      const newPriceId = 'price_123';
      mockSubscriptionsService.changeSubscriptionPlan.mockResolvedValue({});

      const { result } = renderHook(() => useSubscription(), {
        wrapper: createQueryWrapper(),
      });
      await result.current.changeSubscriptionPlan(newPriceId);

      await waitFor(() => {
        expect(
          mockSubscriptionsService.changeSubscriptionPlan,
        ).toHaveBeenCalledWith(newPriceId);
      });
    });

    it('should show success notification after plan change', async () => {
      const newPriceId = 'price_123';
      mockSubscriptionsService.changeSubscriptionPlan.mockResolvedValue({});

      const { result } = renderHook(() => useSubscription(), {
        wrapper: createQueryWrapper(),
      });
      await result.current.changeSubscriptionPlan(newPriceId);

      await waitFor(() => {
        expect(mockNotificationsService.success).toHaveBeenCalledWith(
          'Subscription plan changed',
        );
      });
    });

    it('rethrows a failure for the caller to classify, without notifying itself', async () => {
      const newPriceId = 'price_123';
      mockSubscriptionsService.changeSubscriptionPlan.mockRejectedValue(
        new Error('Failed'),
      );

      const { result } = renderHook(() => useSubscription(), {
        wrapper: createQueryWrapper(),
      });

      await expect(
        result.current.changeSubscriptionPlan(newPriceId),
      ).rejects.toThrow();

      // The API classifies this failure with a public code and a retry
      // allowance; a generic toast here would be a second notification for
      // one failure, and would hide both.
      expect(mockNotificationsService.error).not.toHaveBeenCalled();
    });
  });

  describe('refresh functions', () => {
    it('should have refreshSubscription function', () => {
      const { result } = renderHook(() => useSubscription(), {
        wrapper: createQueryWrapper(),
      });

      expect(typeof result.current.refreshSubscription).toBe('function');
    });

    it('should have refreshCreditsBreakdown function', () => {
      const { result } = renderHook(() => useSubscription(), {
        wrapper: createQueryWrapper(),
      });

      expect(typeof result.current.refreshCreditsBreakdown).toBe('function');
    });
  });

  describe('return value structure', () => {
    it('should return all expected properties', () => {
      const { result } = renderHook(() => useSubscription(), {
        wrapper: createQueryWrapper(),
      });

      expect(result.current).toHaveProperty('changeSubscriptionPlan');
      expect(result.current).toHaveProperty('creditsBreakdown');
      expect(result.current).toHaveProperty('error');
      expect(result.current).toHaveProperty('isLoading');
      expect(result.current).toHaveProperty('isSubscriptionActive');
      expect(result.current).toHaveProperty('openBillingPortal');
      expect(result.current).toHaveProperty('refreshCreditsBreakdown');
      expect(result.current).toHaveProperty('refreshSubscription');
      expect(result.current).toHaveProperty('subscription');
    });
  });
});
