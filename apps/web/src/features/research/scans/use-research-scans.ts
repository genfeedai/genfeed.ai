'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import type {
  ResearchScanLibrary,
  ResearchScanStatus,
} from '@genfeedai/contracts/interfaces';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { ResearchScansService } from '@services/social/research-scans.service';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

export const RESEARCH_SCANS_QUERY_KEY = 'research-scans';

export interface UseResearchScansReturn {
  /** Re-reads the counts; call it after anything that may have spent a scan. */
  refresh: () => Promise<void>;
  statusFor: (library: ResearchScanLibrary) => ResearchScanStatus | undefined;
}

/** What is left of each library's scans for the current organization. */
export function useResearchScans(): UseResearchScansReturn {
  const { isReady, organizationId } = useBrand();
  const queryClient = useQueryClient();
  const getService = useAuthedService((token: string) =>
    ResearchScansService.getInstance(token),
  );

  const { data: statuses = [] } = useQuery<ResearchScanStatus[]>({
    enabled: isReady && Boolean(organizationId),
    queryFn: async ({ signal }) => {
      const service = await getService();
      return service.list(signal);
    },
    queryKey: [RESEARCH_SCANS_QUERY_KEY, organizationId],
  });

  const refresh = useCallback(async () => {
    await queryClient.invalidateQueries({
      queryKey: [RESEARCH_SCANS_QUERY_KEY],
    });
  }, [queryClient]);

  const statusFor = useCallback(
    (library: ResearchScanLibrary) =>
      statuses.find((status) => status.library === library),
    [statuses],
  );

  return { refresh, statusFor };
}
