import type {
  ICostReportEntriesQuery,
  ICostReportEntry,
  ICostReportQuery,
  ICostReportSummary,
} from '@genfeedai/contracts/interfaces/billing';
import { EnvironmentService } from '@services/core/environment.service';
import { HTTPBaseService } from '@services/core/interceptor.service';
import {
  deserializeCollection,
  deserializeResource,
  type JsonApiResponseDocument,
} from '@services/core/json-api';

export class CostsService extends HTTPBaseService {
  constructor(token: string) {
    super(`${EnvironmentService.apiEndpoint}/costs`, token);
  }

  static getInstance(token: string): CostsService {
    return HTTPBaseService.getBaseServiceInstance(
      CostsService,
      token,
    ) as CostsService;
  }

  async getSummary(query: ICostReportQuery): Promise<ICostReportSummary> {
    const response = await this.instance.get<JsonApiResponseDocument>(
      '/summary',
      { params: query },
    );
    return deserializeResource<ICostReportSummary>(response.data);
  }

  async getEntries(
    query: ICostReportEntriesQuery,
  ): Promise<ICostReportEntry[]> {
    const response = await this.instance.get<JsonApiResponseDocument>(
      '/entries',
      { params: query },
    );
    return deserializeCollection<ICostReportEntry>(response.data);
  }

  async exportCsv(query: ICostReportQuery): Promise<ArrayBuffer> {
    const response = await this.instance.get<ArrayBuffer>('/export', {
      params: query,
      responseType: 'arraybuffer',
    });
    return response.data;
  }
}
