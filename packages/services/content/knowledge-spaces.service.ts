import {
  KnowledgeSpace,
  KnowledgeSpaceMembership,
} from '@genfeedai/client/models';
import type { KnowledgeMemoryScope } from '@genfeedai/contracts';
import { API_ENDPOINTS } from '@genfeedai/contracts/constants';
import { KnowledgeSpaceSerializer } from '@genfeedai/serializers';
import { BaseService } from '@services/core/base.service';
import {
  deserializeCollection,
  deserializeResource,
  type JsonApiResponseDocument,
} from '@services/core/json-api';

export interface KnowledgeSpaceCreateRequest {
  scope: KnowledgeMemoryScope;
  title: string;
}

export class KnowledgeSpacesService extends BaseService<
  KnowledgeSpace,
  KnowledgeSpaceCreateRequest,
  { title?: string }
> {
  constructor(token: string) {
    super(
      API_ENDPOINTS.KNOWLEDGE_SPACES,
      token,
      KnowledgeSpace,
      KnowledgeSpaceSerializer,
    );
  }

  public static getInstance(token: string): KnowledgeSpacesService {
    return BaseService.getDataServiceInstance(KnowledgeSpacesService, token);
  }

  public findForBrand(
    brandId: string | undefined,
    signal?: AbortSignal,
  ): Promise<KnowledgeSpace[]> {
    return this.findAll(BaseService.cleanBody({ brandId, limit: 100 }), signal);
  }

  public ensureInbox(
    scope: KnowledgeMemoryScope,
    brandId?: string,
  ): Promise<KnowledgeSpace> {
    return this.executeWithErrorHandling(
      `POST ${this.baseURL}/inbox`,
      this.instance
        .post<JsonApiResponseDocument>(
          '/inbox',
          { scope },
          { params: BaseService.cleanBody({ brandId }) },
        )
        .then(async (res) => await this.mapOne(res.data)),
    );
  }

  public create(
    body: KnowledgeSpaceCreateRequest,
    brandId?: string,
  ): Promise<KnowledgeSpace> {
    return this.executeWithErrorHandling(
      `POST ${this.baseURL}`,
      this.instance
        .post<JsonApiResponseDocument>('', body, {
          params: BaseService.cleanBody({ brandId }),
        })
        .then(async (res) => await this.mapOne(res.data)),
    );
  }

  public findMemberships(
    spaceId: string,
    brandId?: string,
    signal?: AbortSignal,
  ): Promise<KnowledgeSpaceMembership[]> {
    return this.executeWithErrorHandling(
      `GET ${this.baseURL}/${spaceId}/memberships`,
      this.instance
        .get<JsonApiResponseDocument>(`/${spaceId}/memberships`, {
          params: BaseService.cleanBody({ brandId }),
          signal,
        })
        .then((res) =>
          deserializeCollection<Partial<KnowledgeSpaceMembership>>(
            res.data,
          ).map((membership) => new KnowledgeSpaceMembership(membership)),
        ),
    );
  }

  public addMember(
    spaceId: string,
    sourceId: string,
    brandId?: string,
  ): Promise<KnowledgeSpaceMembership> {
    return this.executeWithErrorHandling(
      `PUT ${this.baseURL}/${spaceId}/memberships/${sourceId}`,
      this.instance
        .put<JsonApiResponseDocument>(
          `/${spaceId}/memberships/${sourceId}`,
          {},
          { params: BaseService.cleanBody({ brandId }) },
        )
        .then(
          (res) =>
            new KnowledgeSpaceMembership(
              deserializeResource<Partial<KnowledgeSpaceMembership>>(res.data),
            ),
        ),
    );
  }

  public removeMember(
    spaceId: string,
    sourceId: string,
    brandId?: string,
  ): Promise<void> {
    return this.executeWithErrorHandling(
      `DELETE ${this.baseURL}/${spaceId}/memberships/${sourceId}`,
      this.instance
        .delete(`/${spaceId}/memberships/${sourceId}`, {
          params: BaseService.cleanBody({ brandId }),
        })
        .then(() => undefined),
    );
  }
}
