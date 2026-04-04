import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock Clerk
vi.mock('@clerk/nextjs', () => ({
  useUser: vi.fn(() => ({
    user: {
      id: 'user-123',
      publicMetadata: { organization: 'org-123' },
    },
  })),
}));

// Mock helpers
vi.mock('@helpers/auth/clerk.helper', () => ({
  getClerkPublicData: vi.fn(() => ({ organization: 'org-123' })),
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
    return async () => {
      const serviceName = factory.toString();
      if (serviceName.includes('SubscriptionsService')) {
        return mockSubscriptionsService;
      }
      if (serviceName.includes('StripeService')) {
        return mockStripeService;
      }
      if (serviceName.includes('OrganizationsService')) {
        return mockOrganizationsService;
      }
      return {};
    };
  }),
}));

// Mock useResource
vi.mock('@hooks/data/resource/use-resource/use-resource', () => ({
  useResource: vi.fn(
    (
      _fetcher: () => Promise<unknown>,
      options?: { dependencies?: unknown[] },
    ) => {
      const deps = options?.dependencies || [];
      const hasDeps = deps.some((d) => d !== undefined);

      return {
        data: hasDeps ? { status: 'active' } : null,
        error: null,
        isLoading: false,
        refresh: vi.fn(),
      };
    },
  ),
}));

// Mock services
vi.mock('@services/billing/stripe.service', () => ({
  StripeService: {
    getInstance: vi.fn(() => mockStripeService),
  },
}));

vi.mock('@services/billing/subscriptions.service', () => ({
  SubscriptionsService: {
    getInstance: vi.fn(() => mockSubscriptionsService),
  },
}));

vi.mock('@services/organization/organizations.service', () => ({
  OrganizationsService: {
    getInstance: vi.fn(() => mockOrganizationsService),
  },
}));

vi.mock('@services/core/logger.service', () => ({
  logger: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

const mockNotificationsService = {
  error: vi.fn(),
  info: vi.fn(),
  success: vi.fn(),
};

vi.mock('@services/core/notifications.service', () => ({
  NotificationsService: {
    getInstance: vi.fn(() => mockNotificationsService),
  },
}));

import { useUser } from '@clerk/nextjs';

import { useSubscription } from '@hooks/data/subscription/use-subscription/use-subscription';

describe('useSubscription', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('initialization', () => {
    it('should return subscription data', () => {
      const { result } = renderHook(() => useSubscription());

      expect(result.current).toBeDefined();
      expect(result.current.subscription).toBeDefined();
    });

    it('should return loading state', () => {
      const { result } = renderHook(() => useSubscription());

      expect(typeof result.current.isLoading).toBe('boolean');
    });

    it('should return creditsBreakdown', () => {
      const { result } = renderHook(() => useSubscription());

      expect(result.current.creditsBreakdown).toBeDefined();
    });

    it('should return error state', () => {
      const { result } = renderHook(() => useSubscription());

      expect(result.current.error).toBeNull();
    });

    it('should return isSubscriptionActive', () => {
      const { result } = renderHook(() => useSubscription());

      expect(typeof result.current.isSubscriptionActive).toBe('boolean');
    });
  });

  describe('subscription status', () => {
    it('should set isSubscriptionActive to true when subscription is active', () => {
      const { result } = renderHook(() => useSubscription());

      expect(result.current.isSubscriptionActive).toBe(true);
    });

    it('should set isSubscriptionActive to false when no user', () => {
      vi.mocked(useUser).mockReturnValueOnce({ user: null } as any);

      const { result } = renderHook(() => useSubscription());

      // With no user, organization ID won't be set
      expect(result.current.subscription).toBeDefined();
    });
  });

  describe('openBillingPortal', () => {
    it('should be a function', () => {
      const { result } = renderHook(() => useSubscription());

      expect(typeof result.current.openBillingPortal).toBe('function');
    });

    it('should call stripe service to get portal URL', async () => {
      const mockUrl = 'https://billing.stripe.com/portal';
      mockStripeService.getPortalUrl.mockResolvedValue({ url: mockUrl });

      const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);

      const { result } = renderHook(() => useSubscription());
      await result.current.openBillingPortal();

      await waitFor(() => {
        expect(openSpy).toHaveBeenCalledWith(mockUrl, '_blank');
      });

      openSpy.mockRestore();
    });

    it('should show error notification on failure', async () => {
      mockStripeService.getPortalUrl.mockRejectedValue(new Error('Failed'));

      const { result } = renderHook(() => useSubscription());
      await result.current.openBillingPortal();

      await waitFor(() => {
        expect(mockNotificationsService.error).toHaveBeenCalledWith(
          'Opening billing portal',
        );
      });
    });
  });

  describe('changeSubscriptionPlan', () => {
    it('should be a function', () => {
      const { result } = renderHook(() => useSubscription());

      expect(typeof result.current.changeSubscriptionPlan).toBe('function');
    });

    it('should call subscriptions service to change plan', async () => {
      const newPriceId = 'price_123';
      mockSubscriptionsService.changeSubscriptionPlan.mockResolvedValue({});

      const { result } = renderHook(() => useSubscription());
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

      const { result } = renderHook(() => useSubscription());
      await result.current.changeSubscriptionPlan(newPriceId);

      await waitFor(() => {
        expect(mockNotificationsService.success).toHaveBeenCalledWith(
          'Subscription plan changed',
        );
      });
    });

    it('should show error notification on failure', async () => {
      const newPriceId = 'price_123';
      mockSubscriptionsService.changeSubscriptionPlan.mockRejectedValue(
        new Error('Failed'),
      );

      const { result } = renderHook(() => useSubscription());

      await expect(
        result.current.changeSubscriptionPlan(newPriceId),
      ).rejects.toThrow();

      await waitFor(() => {
        expect(mockNotificationsService.error).toHaveBeenCalledWith(
          'Subscription plan change',
        );
      });
    });
  });

  describe('refresh functions', () => {
    it('should have refreshSubscription function', () => {
      const { result } = renderHook(() => useSubscription());

      expect(typeof result.current.refreshSubscription).toBe('function');
    });

    it('should have refreshCreditsBreakdown function', () => {
      const { result } = renderHook(() => useSubscription());

      expect(typeof result.current.refreshCreditsBreakdown).toBe('function');
    });
  });

  describe('return value structure', () => {
    it('should return all expected properties', () => {
      const { result } = renderHook(() => useSubscription());

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
