'use client';

import { ContentIntelligencePlatform } from '@genfeedai/contracts';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useCollectionScope } from '@hooks/navigation/use-collection-scope/use-collection-scope';
import { CredentialsService } from '@services/organization/credentials.service';
import { useQuery } from '@tanstack/react-query';

export function useCampaignAccounts(brandId: string) {
  const { organizationId, isReady } = useCollectionScope();
  const getService = useAuthedService((token: string) =>
    CredentialsService.getInstance(token),
  );
  const query = useQuery({
    queryKey: ['campaign-accounts', organizationId, brandId],
    enabled: Boolean(isReady && organizationId && brandId),
    queryFn: async ({ signal }) => {
      const service = await getService();
      const accounts = await service.findAllPages(
        { brandId, organizationId },
        signal,
      );
      return accounts.filter(
        (account) =>
          account.brandId === brandId &&
          account.isConnected &&
          !account.isDeleted,
      );
    },
  });
  const accounts = query.data ?? [];
  const supported = Object.values(ContentIntelligencePlatform) as string[];
  return {
    ...query,
    accounts,
    eligibleAccounts: accounts.filter((account) =>
      supported.includes(account.platform),
    ),
  };
}
