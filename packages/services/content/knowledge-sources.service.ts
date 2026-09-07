import {
  KnowledgeSource,
  KnowledgeSourceVersion,
} from '@genfeedai/client/models';
import { API_ENDPOINTS } from '@genfeedai/contracts/constants';
import type {
  KnowledgeSourceCaptureRequest,
  KnowledgeSourceCaptureResult,
  KnowledgeSourceUpdateRequest,
} from '@genfeedai/contracts/interfaces';
import {
  KnowledgeSourceSerializer,
  KnowledgeSourceVersionSerializer,
} from '@genfeedai/serializers';
import { BaseService } from '@services/core/base.service';
import {
  deserializeCollection,
  deserializeResource,
  type JsonApiResponseDocument,
} from '@services/core/json-api';

export interface KnowledgeSourceListQuery {
  brandId?: string;
  limit?: number;
  page?: number;
}

/**
 * Brand Knowledge sources. Every call carries `brandId` as a query parameter;
 * the API resolves the actor from it and never trusts a brand in the body.
 */
export class KnowledgeSourcesService extends BaseService<
  KnowledgeSource,
  KnowledgeSourceCaptureRequest,
  KnowledgeSourceUpdateRequest
> {
  constructor(token: string) {
    super(
      API_ENDPOINTS.KNOWLEDGE_SOURCES,
      token,
      KnowledgeSource,
      KnowledgeSourceSerializer,
    );
  }

  public static getInstance(token: string): KnowledgeSourcesService {
    return BaseService.getDataServiceInstance(KnowledgeSourcesService, token);
  }

  public findForBrand(
    query: KnowledgeSourceListQuery,
    signal?: AbortSignal,
  ): Promise<KnowledgeSource[]> {
    return this.findAll(BaseService.cleanBody(query), signal);
  }

  public async capture(
    body: KnowledgeSourceCaptureRequest,
    brandId?: string,
  ): Promise<KnowledgeSourceCaptureResult> {
    return this.executeWithErrorHandling(
      `POST ${this.baseURL}`,
      this.instance
        .post<JsonApiResponseDocument & { jobId?: string; versionId?: string }>(
          '',
          BaseService.cleanBody(body, { excludeId: true }),
          { params: BaseService.cleanBody({ brandId }) },
        )
        .then(async (res) => ({
          jobId: res.data.jobId,
          source: await this.mapOne(res.data),
          versionId: res.data.versionId,
        })),
    );
  }

  public update(
    id: string,
    body: KnowledgeSourceUpdateRequest,
    brandId?: string,
  ): Promise<KnowledgeSource> {
    return this.executeWithErrorHandling(
      `PATCH ${this.baseURL}/${id}`,
      this.instance
        .patch<JsonApiResponseDocument>(`/${id}`, BaseService.cleanBody(body), {
          params: BaseService.cleanBody({ brandId }),
        })
        .then(async (res) => await this.mapOne(res.data)),
    );
  }

  public archive(id: string, brandId?: string): Promise<KnowledgeSource> {
    return this.executeWithErrorHandling(
      `DELETE ${this.baseURL}/${id}`,
      this.instance
        .delete<JsonApiResponseDocument>(`/${id}`, {
          params: BaseService.cleanBody({ brandId }),
        })
        .then(async (res) => await this.mapOne(res.data)),
    );
  }

  public retry(
    id: string,
    brandId?: string,
  ): Promise<{ jobId?: string; version: KnowledgeSourceVersion }> {
    return this.executeWithErrorHandling(
      `POST ${this.baseURL}/${id}/retry`,
      this.instance
        .post<JsonApiResponseDocument & { jobId?: string }>(
          `/${id}/retry`,
          {},
          { params: BaseService.cleanBody({ brandId }) },
        )
        .then((res) => ({
          jobId: res.data.jobId,
          version: new KnowledgeSourceVersion(
            deserializeResource<Partial<KnowledgeSourceVersion>>(res.data),
          ),
        })),
    );
  }

  public findVersions(
    id: string,
    brandId?: string,
    signal?: AbortSignal,
  ): Promise<KnowledgeSourceVersion[]> {
    return this.executeWithErrorHandling(
      `GET ${this.baseURL}/${id}/versions`,
      this.instance
        .get<JsonApiResponseDocument>(`/${id}/versions`, {
          params: BaseService.cleanBody({ brandId, limit: 25, page: 1 }),
          signal,
        })
        .then((res) =>
          deserializeCollection<Partial<KnowledgeSourceVersion>>(res.data).map(
            (version) => new KnowledgeSourceVersion(version),
          ),
        ),
    );
  }
}

export { KnowledgeSourceVersionSerializer };
