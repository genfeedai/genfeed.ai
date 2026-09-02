'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import type { IBillingAccount } from '@genfeedai/contracts/interfaces';
import { BillingAccountsService } from '@genfeedai/services/billing/billing-accounts.service';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useQuery } from '@tanstack/react-query';

export function useBillingAccount() {
  const { organizationId } = useBrand();
  const getService = useAuthedService((token: string) =>
    BillingAccountsService.getInstance(token),
  );

  const { data, isLoading, error, refetch } = useQuery({
    enabled: Boolean(organizationId),
    queryFn: async () => {
      const service = await getService();
      return service.getCurrent();
    },
    queryKey: ['billing-account', organizationId],
    staleTime: 30_000,
  });

  return {
    account: (data ?? null) as IBillingAccount | null,
    error,
    isLoading,
    refresh: refetch,
  };
}
