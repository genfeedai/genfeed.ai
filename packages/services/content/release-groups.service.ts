import type { IReleaseGroup } from '@genfeedai/interfaces';
import { EnvironmentService } from '@services/core/environment.service';
import { HTTPBaseService } from '@services/core/interceptor.service';
import {
  extractCollection,
  extractResource,
  type JsonApiResponseDocument,
} from '@services/core/json-api';

export interface ReleaseGroupListQuery {
  brandId?: string;
  endDate: string;
  startDate: string;
}

export class ReleaseGroupsService extends HTTPBaseService {
  constructor(token: string) {
    super(`${EnvironmentService.apiEndpoint}/post-groups`, token);
  }

  static getInstance(token: string): ReleaseGroupsService {
    return HTTPBaseService.getBaseServiceInstance(
      ReleaseGroupsService,
      token,
    ) as ReleaseGroupsService;
  }

  async findAll(query: ReleaseGroupListQuery): Promise<IReleaseGroup[]> {
    const response = await this.instance.get<JsonApiResponseDocument>('', {
      params: query,
    });

    return extractCollection<IReleaseGroup>(response.data);
  }

  async findOne(releaseId: string): Promise<IReleaseGroup> {
    const response = await this.instance.get<JsonApiResponseDocument>(
      `/${releaseId}`,
    );

    return extractResource<IReleaseGroup>(response.data);
  }
}
