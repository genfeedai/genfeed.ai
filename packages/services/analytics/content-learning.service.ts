import type {
  LearningAccountView,
  LearningConsentInput,
  LearningControlInput,
  LearningDatasetInput,
  LearningOperationView,
  LearningReceivingInput,
  LearningResourceView,
} from '@genfeedai/contracts';
import { API_ENDPOINTS } from '@genfeedai/contracts/constants';
import { EnvironmentService } from '@services/core/environment.service';
import { HTTPBaseService } from '@services/core/interceptor.service';
import {
  deserializeCollection,
  deserializeResource,
  type JsonApiResponseDocument,
} from '@services/core/json-api';
export class ContentLearningService extends HTTPBaseService {
  constructor(token: string) {
    super(
      `${EnvironmentService.apiEndpoint}${API_ENDPOINTS.CONTENT_LEARNING}`,
      token,
    );
  }
  static getInstance(token: string): ContentLearningService {
    return HTTPBaseService.getBaseServiceInstance(
      ContentLearningService,
      token,
    ) as ContentLearningService;
  }
  private async get<T>(path: string, signal?: AbortSignal): Promise<T> {
    const response = await this.instance.get<JsonApiResponseDocument>(path, {
      signal,
    });
    return deserializeResource<T>(response.data);
  }
  private async list<T>(
    path: string,
    params: Record<string, unknown> = {},
    signal?: AbortSignal,
  ): Promise<T[]> {
    const response = await this.instance.get<JsonApiResponseDocument>(path, {
      params,
      signal,
    });
    return deserializeCollection<T>(response.data);
  }
  private async mutate<T>(
    method: 'post' | 'patch',
    path: string,
    body: unknown,
  ): Promise<T> {
    const response = await this.instance[method]<JsonApiResponseDocument>(
      path,
      body,
    );
    return deserializeResource<T>(response.data);
  }
  accounts(brandId: string, signal?: AbortSignal) {
    return this.list<LearningAccountView>('accounts', { brandId }, signal);
  }
  account(credentialId: string, signal?: AbortSignal) {
    return this.get<LearningAccountView>(
      `accounts/${encodeURIComponent(credentialId)}`,
      signal,
    );
  }
  evidence(
    credentialId: string,
    params: { page?: number; limit?: number } = {},
    signal?: AbortSignal,
  ) {
    return this.list<LearningResourceView>(
      `accounts/${encodeURIComponent(credentialId)}/evidence`,
      params,
      signal,
    );
  }
  decision(id: string, signal?: AbortSignal) {
    return this.get<LearningResourceView>(
      `decisions/${encodeURIComponent(id)}`,
      signal,
    );
  }
  policy(id: string, signal?: AbortSignal) {
    return this.get<LearningResourceView>(
      `policies/${encodeURIComponent(id)}`,
      signal,
    );
  }
  control(credentialId: string, body: LearningControlInput) {
    return this.mutate<LearningOperationView>(
      'post',
      `accounts/${encodeURIComponent(credentialId)}/control`,
      body,
    );
  }
  sharing(credentialId: string, body: LearningConsentInput) {
    return this.mutate<LearningOperationView>(
      'patch',
      `accounts/${encodeURIComponent(credentialId)}/sharing`,
      body,
    );
  }
  receiving(credentialId: string, body: LearningReceivingInput) {
    return this.mutate<LearningOperationView>(
      'patch',
      `accounts/${encodeURIComponent(credentialId)}/shared-release`,
      body,
    );
  }
  brandReceiving(brandId: string, body: LearningReceivingInput) {
    return this.mutate<LearningOperationView>(
      'patch',
      `brands/${encodeURIComponent(brandId)}/shared-release`,
      body,
    );
  }
  attest(
    postId: string,
    body: {
      isOrganic: true;
      isPinned: false;
      coverThrough: string;
      expectedRevision: number;
      requestId: string;
    },
  ) {
    return this.mutate<LearningOperationView>(
      'post',
      `posts/${encodeURIComponent(postId)}/eligibility`,
      body,
    );
  }
  adminList(
    resource: 'accounts' | 'datasets' | 'runs' | 'releases',
    signal?: AbortSignal,
  ) {
    return this.list<LearningResourceView>(
      `${EnvironmentService.apiEndpoint}${API_ENDPOINTS.ADMIN_CONTENT_LEARNING}/${resource}`,
      {},
      signal,
    );
  }
  createDataset(body: LearningDatasetInput) {
    return this.mutate<LearningResourceView>(
      'post',
      `${EnvironmentService.apiEndpoint}${API_ENDPOINTS.ADMIN_CONTENT_LEARNING}/datasets`,
      body,
    );
  }
  train(id: string, requestId: string) {
    return this.mutate<LearningResourceView>(
      'post',
      `${EnvironmentService.apiEndpoint}${API_ENDPOINTS.ADMIN_CONTENT_LEARNING}/datasets/${encodeURIComponent(id)}/train`,
      { requestId },
    );
  }
  evaluate(id: string, requestId: string) {
    return this.mutate<LearningResourceView>(
      'post',
      `${EnvironmentService.apiEndpoint}${API_ENDPOINTS.ADMIN_CONTENT_LEARNING}/runs/${encodeURIComponent(id)}/evaluate`,
      { requestId },
    );
  }
  runControl(id: string, action: 'cancel' | 'retry', requestId: string) {
    return this.mutate<LearningResourceView>(
      'post',
      `${EnvironmentService.apiEndpoint}${API_ENDPOINTS.ADMIN_CONTENT_LEARNING}/runs/${encodeURIComponent(id)}/${action}`,
      { requestId },
    );
  }
  createRelease(body: {
    artifactIds: string[];
    reportId: string;
    requestId: string;
  }) {
    return this.mutate<LearningOperationView>(
      'post',
      `${EnvironmentService.apiEndpoint}${API_ENDPOINTS.ADMIN_CONTENT_LEARNING}/releases`,
      body,
    );
  }
  releaseControl(
    id: string,
    body: {
      action: 'canary' | 'limited' | 'stable' | 'pause' | 'rollback';
      expectedRevision: number;
      requestId: string;
      reason: string;
    },
  ) {
    return this.mutate<LearningOperationView>(
      'post',
      `${EnvironmentService.apiEndpoint}${API_ENDPOINTS.ADMIN_CONTENT_LEARNING}/releases/${encodeURIComponent(id)}/control`,
      body,
    );
  }
}
