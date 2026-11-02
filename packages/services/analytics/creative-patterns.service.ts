import type {
  ICreativePattern,
  IPaginatedResponse,
  PatternType,
} from '@genfeedai/contracts/interfaces';
import { EnvironmentService } from '@services/core/environment.service';
import { HTTPBaseService } from '@services/core/interceptor.service';
import {
  extractCollection,
  type JsonApiResponseDocument,
} from '@services/core/json-api';
import { toPaginatedResponse } from '@services/core/paginated-response';

export interface CreativePatternListFilters {
  brandId?: string;
  patternType?: PatternType | '';
  platform?: string;
  scope?: string;
}

export interface CreativePatternListQuery {
  limit?: number;
  page?: number;
}

export class CreativePatternsService extends HTTPBaseService {
  constructor(token: string) {
    super(`${EnvironmentService.apiEndpoint}/creative-patterns`, token);
  }

  public static getInstance(token: string): CreativePatternsService {
    return HTTPBaseService.getBaseServiceInstance(
      CreativePatternsService,
      token,
    ) as CreativePatternsService;
  }

  /**
   * One page of patterns with metadata from the same response.
   */
  public async findAll(
    filters: CreativePatternListFilters = {},
    query: CreativePatternListQuery = {},
    signal?: AbortSignal,
  ): Promise<IPaginatedResponse<ICreativePattern>> {
    const response = await this.instance.get<JsonApiResponseDocument>('', {
      params: {
        brandId: filters.brandId || undefined,
        limit: query.limit || undefined,
        page: query.page || undefined,
        patternType: filters.patternType || undefined,
        platform: filters.platform || undefined,
        scope: filters.scope || undefined,
      },
      signal,
    });
    return toPaginatedResponse(
      extractCollection<ICreativePattern>(response.data),
      response.data,
    );
  }
}
