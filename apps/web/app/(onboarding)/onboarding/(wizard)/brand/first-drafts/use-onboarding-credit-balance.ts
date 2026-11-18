'use client';
import { useBrand } from '@contexts/user/brand-context/brand-context';
import { CreditsService } from '@genfeedai/services/billing/credits.service';
import { useAuthedQuery } from '@hooks/auth/use-authed-query/use-authed-query';

/**
 * The organization's Genfeed wallet balance, read from the same endpoint the
 * topbar chip uses. Onboarding has no organization route, so the shared chip
 * hook (which waits for one) cannot serve this step. `null` means the balance
 * could not be read, which the prompt step says instead of showing zero.
 */
export function useOnboardingCreditBalance(): {
  balance: number | null;
  isLoading: boolean;
} {
  const { organizationId } = useBrand();
  const query = useAuthedQuery({
    enabled: Boolean(organizationId),
    queryFn: async (service: CreditsService) => {
      const balances = await service.getTopbarBalances();
      const balance = balances.segments?.find(
        (segment) => segment.provider === 'genfeed',
      )?.balance;
      return typeof balance === 'number' && Number.isFinite(balance)
        ? balance
        : null;
    },
    queryKey: ['onboarding-credit-balance', organizationId ?? ''],
    retry: false,
    service: (token: string) => new CreditsService(token),
  });

  return {
    balance: query.data ?? null,
    isLoading: query.isPending && query.fetchStatus !== 'idle',
  };
}
