import { API_ENDPOINTS } from '@genfeedai/contracts/constants';
import type {
  CompleteSocialWarmupItemInput,
  CreateSocialWarmupEnrollmentInput,
  ISocialWarmupEnrollment,
  UpsertSocialWarmupSignalInput,
} from '@genfeedai/contracts/interfaces';
import { SocialWarmupEnrollment } from '@genfeedai/models/social/social-warmup-enrollment.model';
import { SocialWarmupEnrollmentSerializer } from '@genfeedai/serializers';
import { BaseService } from '@services/core/base.service';
import type { JsonApiResponseDocument } from '@services/core/json-api';

export class SocialWarmupEnrollmentsService extends BaseService<
  SocialWarmupEnrollment,
  CreateSocialWarmupEnrollmentInput
> {
  constructor(token: string) {
    super(
      API_ENDPOINTS.SOCIAL_WARMUP_ENROLLMENTS,
      token,
      SocialWarmupEnrollment,
      SocialWarmupEnrollmentSerializer,
    );
  }

  public static getInstance(token: string): SocialWarmupEnrollmentsService {
    return BaseService.getDataServiceInstance(
      SocialWarmupEnrollmentsService,
      token,
    );
  }

  async enroll(
    data: CreateSocialWarmupEnrollmentInput,
  ): Promise<ISocialWarmupEnrollment> {
    const response = await this.instance.post<JsonApiResponseDocument>(
      '/',
      data,
    );
    return new SocialWarmupEnrollment(
      this.extractResource<Partial<ISocialWarmupEnrollment>>(response.data),
    );
  }

  async completeItem(
    enrollmentId: string,
    itemId: string,
    data: CompleteSocialWarmupItemInput = {},
  ): Promise<ISocialWarmupEnrollment> {
    const response = await this.instance.post<JsonApiResponseDocument>(
      `/${enrollmentId}/items/${itemId}/complete`,
      data,
    );
    return new SocialWarmupEnrollment(
      this.extractResource<Partial<ISocialWarmupEnrollment>>(response.data),
    );
  }

  async reopenItem(
    enrollmentId: string,
    itemId: string,
    data: CompleteSocialWarmupItemInput = {},
  ): Promise<ISocialWarmupEnrollment> {
    const response = await this.instance.post<JsonApiResponseDocument>(
      `/${enrollmentId}/items/${itemId}/reopen`,
      data,
    );
    return new SocialWarmupEnrollment(
      this.extractResource<Partial<ISocialWarmupEnrollment>>(response.data),
    );
  }

  async upsertSignal(
    enrollmentId: string,
    data: UpsertSocialWarmupSignalInput,
  ): Promise<ISocialWarmupEnrollment> {
    const response = await this.instance.post<JsonApiResponseDocument>(
      `/${enrollmentId}/signals`,
      data,
    );
    return new SocialWarmupEnrollment(
      this.extractResource<Partial<ISocialWarmupEnrollment>>(response.data),
    );
  }
}
