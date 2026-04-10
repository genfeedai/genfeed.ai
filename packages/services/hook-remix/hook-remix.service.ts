import type {
  HookRemixBatchFormData,
  HookRemixBatchResponse,
  HookRemixCreateResponse,
  HookRemixFormData,
  HookRemixJobStatus,
} from '@genfeedai/props/trends/hook-remix.props';
import { EnvironmentService } from '@services/core/environment.service';
import { HTTPBaseService } from '@services/core/interceptor.service';
import { logger } from '@services/core/logger.service';

export class HookRemixService extends HTTPBaseService {
  constructor(token: string) {
    super(`${EnvironmentService.apiEndpoint}/hook-remix`, token);
  }

  public static getInstance(token: string): HookRemixService {
    return HTTPBaseService.getBaseServiceInstance(
      HookRemixService,
      token,
    ) as HookRemixService;
  }

  /**
   * Create a single hook remix job
   * @param data - Hook remix form data including brand, CTA clip, and hook duration
   * @returns Created job with ID and status
   */
  async createHookRemix(
    data: HookRemixFormData & { videoId: string },
  ): Promise<HookRemixCreateResponse> {
    try {
      const response = await this.instance
        .post<HookRemixCreateResponse>('/', data)
        .then((res) => res.data);
      return response;
    } catch (error) {
      logger.error('Failed to create hook remix', { error });
      throw error;
    }
  }

  /**
   * Create batch hook remix jobs for multiple videos
   * @param data - Batch form data including brand, CTA clip, hook duration, and video IDs
   * @returns Batch response with queued job details
   */
  async createBatchHookRemix(
    data: HookRemixBatchFormData,
  ): Promise<HookRemixBatchResponse> {
    try {
      const response = await this.instance
        .post<HookRemixBatchResponse>('/batch', data)
        .then((res) => res.data);
      return response;
    } catch (error) {
      logger.error('Failed to create batch hook remix', { error });
      throw error;
    }
  }

  /**
   * Get the status of a hook remix job
   * @param jobId - The job ID to check
   * @returns Current job status with progress and result info
   */
  async getJobStatus(jobId: string): Promise<HookRemixJobStatus> {
    try {
      const response = await this.instance
        .get<HookRemixJobStatus>(`/${jobId}/status`)
        .then((res) => res.data);
      return response;
    } catch (error) {
      logger.error('Failed to get hook remix job status', { error, jobId });
      throw error;
    }
  }
}
