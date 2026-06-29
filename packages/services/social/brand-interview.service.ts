import { API_ENDPOINTS } from '@genfeedai/constants';
import type {
  IActiveBrandInterview,
  IBrandInterviewAnswerResult,
  IBrandInterviewCompleteness,
  IBrandInterviewStartResult,
} from '@genfeedai/interfaces';
import { EnvironmentService } from '@services/core/environment.service';
import { HTTPBaseService } from '@services/core/interceptor.service';
import {
  buildInstanceKey,
  ServiceInstanceManager,
} from '@services/core/service-instance-manager';

export type { IActiveBrandInterview };

const serviceInstances = new ServiceInstanceManager<BrandInterviewService>();

export interface StartInterviewOptions {
  signal?: AbortSignal;
}

export class BrandInterviewService extends HTTPBaseService {
  constructor(token: string) {
    super(`${EnvironmentService.apiEndpoint}${API_ENDPOINTS.BRANDS}`, token);
  }

  public static getInstance(token: string): BrandInterviewService {
    const instanceKey = buildInstanceKey([token]);
    const cached = serviceInstances.get<BrandInterviewService>(
      BrandInterviewService,
      instanceKey,
    );

    if (
      cached &&
      Object.getPrototypeOf(cached) === BrandInterviewService.prototype
    ) {
      return cached;
    }

    const instance = new BrandInterviewService(token);
    serviceInstances.set(BrandInterviewService, instanceKey, instance);

    return instance;
  }

  public async startInterview(
    brandId: string,
    opts?: StartInterviewOptions,
  ): Promise<IBrandInterviewStartResult> {
    const response = await this.instance.post<IBrandInterviewStartResult>(
      `/${brandId}/interview`,
      {},
      { signal: opts?.signal },
    );

    return response.data;
  }

  public async getActiveInterview(
    brandId: string,
    signal?: AbortSignal,
  ): Promise<IActiveBrandInterview | null> {
    try {
      const response = await this.instance.get<IActiveBrandInterview | null>(
        `/${brandId}/interview/active`,
        { signal },
      );

      return response.data;
    } catch (err: unknown) {
      const httpErr = err as { response?: { status?: number } };

      if (httpErr?.response?.status === 404) {
        return null;
      }

      throw err;
    }
  }

  public async submitAnswer(
    interviewId: string,
    answer: string,
    signal?: AbortSignal,
  ): Promise<IBrandInterviewAnswerResult> {
    const response = await this.instance.post<IBrandInterviewAnswerResult>(
      `/interview/${interviewId}/answer`,
      { answer },
      { signal },
    );

    return response.data;
  }

  public async skipQuestion(
    interviewId: string,
    signal?: AbortSignal,
  ): Promise<IBrandInterviewAnswerResult> {
    const response = await this.instance.post<IBrandInterviewAnswerResult>(
      `/interview/${interviewId}/skip`,
      {},
      { signal },
    );

    return response.data;
  }

  public async getCompleteness(
    brandId: string,
    signal?: AbortSignal,
  ): Promise<IBrandInterviewCompleteness> {
    const response = await this.instance.get<IBrandInterviewCompleteness>(
      `/${brandId}/completeness`,
      { signal },
    );

    return response.data;
  }
}
