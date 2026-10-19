import type {
  IUnitEconomicsQuery,
  IUnitEconomicsReport,
} from '@genfeedai/contracts/interfaces';
import { PagesService } from '@services/content/pages.service';
import { EnvironmentService } from '@services/core/environment.service';
import { HTTPBaseService } from '@services/core/interceptor.service';
import {
  deserializeResource,
  type JsonApiResponseDocument,
} from '@services/core/json-api';

export class AdminUnitEconomicsService extends HTTPBaseService {
  constructor(token: string) {
    super(`${EnvironmentService.apiEndpoint}/admin/unit-economics`, token);
  }

  public static getInstance(token: string): AdminUnitEconomicsService {
    return HTTPBaseService.getBaseServiceInstance(
      AdminUnitEconomicsService,
      token,
    ) as AdminUnitEconomicsService;
  }

  async getReport(
    query: IUnitEconomicsQuery,
    signal?: AbortSignal,
  ): Promise<IUnitEconomicsReport> {
    const response = await this.instance.get<JsonApiResponseDocument>('', {
      params: query,
      signal,
    });
    const report = deserializeResource<IUnitEconomicsReport>(response.data);
    // Feeds AutoPagination, which reads the totals from PagesService.
    if (query.page && report.pagination) {
      PagesService.setCurrentPage(report.pagination.page);
      PagesService.setTotalPages(report.pagination.pages);
      PagesService.setTotalDocs(report.pagination.total ?? 0);
    }
    return report;
  }
}
