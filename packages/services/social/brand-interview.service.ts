import { API_ENDPOINTS } from '@genfeedai/constants';
import type {
  IActiveBrandInterview,
  IBrandInterviewAnswerResult,
  IBrandInterviewCompleteness,
  IBrandInterviewStartResult,
} from '@genfeedai/interfaces';
import { EnvironmentService } from '@services/core/environment.service';
import { HTTPBaseService } from '@services/core/interceptor.service';

export type { IActiveBrandInterview };

export interface StartInterviewOptions {
  signal?: AbortSignal;
}

export class BrandInterviewService extends HTTPBaseService {
  constructor(token: string) {
    super(`${EnvironmentService.apiEndpoint}${API_ENDPOINTS.BRANDS}`, token);
  }

  public static getInstance(token: string): BrandInterviewService {
    return HTTPBaseService.getBaseServiceInstance(
      BrandInterviewService,
      token,
    ) as BrandInterviewService;
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
    const response = await this.instance.get<IActiveBrandInterview | null>(
      `/${brandId}/interview/active`,
      {
        signal,
        validateStatus: (status) =>
          status === 404 || (status >= 200 && status < 300),
      },
    );

    return response.status === 404 ? null : response.data;
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
