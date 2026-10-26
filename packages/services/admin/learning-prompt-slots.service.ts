import type { LearningPromptSlotOutcomeReport } from '@genfeedai/contracts/interfaces';
import { EnvironmentService } from '@services/core/environment.service';
import { HTTPBaseService } from '@services/core/interceptor.service';

export interface LearningPromptSlotReportParams {
  organizationIds: string[];
  brandId?: string;
}

export class AdminLearningPromptSlotsService extends HTTPBaseService {
  constructor(token: string) {
    super(`${EnvironmentService.apiEndpoint}/admin/content-learning`, token);
  }

  public static getInstance(token: string): AdminLearningPromptSlotsService {
    return HTTPBaseService.getBaseServiceInstance(
      AdminLearningPromptSlotsService,
      token,
    ) as AdminLearningPromptSlotsService;
  }

  /** Read-only; one organization, or several for a pooled internal view. */
  async getReport(
    { organizationIds, brandId }: LearningPromptSlotReportParams,
    signal?: AbortSignal,
  ): Promise<LearningPromptSlotOutcomeReport> {
    const response = await this.instance.get<{
      data: LearningPromptSlotOutcomeReport;
    }>('prompt-slots', {
      params: {
        ...(brandId ? { brandId } : {}),
        organizationIds: organizationIds.join(','),
      },
      signal,
    });
    return response.data.data;
  }
}
