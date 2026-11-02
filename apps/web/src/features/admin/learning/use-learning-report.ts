import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { AdminLearningPromptSlotsService } from '@services/admin/learning-prompt-slots.service';
import { logger } from '@services/core/logger.service';
import { useQuery } from '@tanstack/react-query';
import type { UseLearningReportOptions } from '@/features/admin/props/learning.props';

const REPORT_STALE_TIME_MS = 60 * 1000;

/** The prompt slot report for one organization, loaded as soon as it is known. */
export function useLearningReport({
  brandId = '',
  isEnabled = true,
  organizationId,
}: UseLearningReportOptions) {
  const getService = useAuthedService((token: string) =>
    AdminLearningPromptSlotsService.getInstance(token),
  );

  return useQuery({
    enabled: isEnabled && organizationId !== '',
    queryFn: async ({ signal }) => {
      try {
        const service = await getService();
        return await service.getReport(
          { brandId: brandId || undefined, organizationId },
          signal,
        );
      } catch (error) {
        if (!signal.aborted) {
          logger.error('Failed to load learning prompt slot report', error);
        }
        throw error;
      }
    },
    queryKey: ['admin-learning-report', organizationId, brandId],
    staleTime: REPORT_STALE_TIME_MS,
  });
}
