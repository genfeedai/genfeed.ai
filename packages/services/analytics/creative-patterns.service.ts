import type {
  ICreativePattern,
  PatternType,
} from '@genfeedai/contracts/interfaces';
import { EnvironmentService } from '@services/core/environment.service';
import { HTTPBaseService } from '@services/core/interceptor.service';

export interface CreativePatternListFilters {
  brandId?: string;
  patternType?: PatternType | '';
  platform?: string;
  scope?: string;
}

interface CreativePatternListResponse {
  patterns?: ICreativePattern[];
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

  public async findAll(
    filters: CreativePatternListFilters = {},
    signal?: AbortSignal,
  ): Promise<ICreativePattern[]> {
    const response = await this.instance.get<CreativePatternListResponse>('', {
      params: {
        brandId: filters.brandId || undefined,
        patternType: filters.patternType || undefined,
        platform: filters.platform || undefined,
        scope: filters.scope || undefined,
      },
      signal,
    });

    return response.data.patterns ?? [];
  }
}
