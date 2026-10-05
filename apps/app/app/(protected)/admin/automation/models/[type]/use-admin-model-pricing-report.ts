'use client';

import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { AdminModelPricingService } from '@services/admin/model-pricing.service';
import { useQuery } from '@tanstack/react-query';

export const ADMIN_MODEL_PRICING_QUERY_KEY = ['admin-model-pricing'] as const;

/** One shared snapshot for the attention panel and the pricing table. */
export function useAdminModelPricingReport() {
  const getService = useAuthedService((token: string) =>
    AdminModelPricingService.getInstance(token),
  );
  return useQuery({
    queryKey: ADMIN_MODEL_PRICING_QUERY_KEY,
    queryFn: async ({ signal }) => (await getService()).getReport(signal),
    // An IP-restricted superadmin report: a refusal is final, not transient.
    retry: false,
  });
}
