import type { WorkflowCostReportExecution } from '@genfeedai/contracts/interfaces';
import type {
  ICostReportEntries,
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

  async getWorkflows(
    query: ICostReportQuery,
  ): Promise<WorkflowCostReportExecution[]> {
    const response = await this.instance.get<JsonApiResponseDocument>(
      '/workflows',
      { params: query },
    );
    return deserializeCollection<WorkflowCostReportExecution>(response.data);
  }

  async exportWorkflows(query: ICostReportQuery): Promise<ArrayBuffer> {
    const response = await this.instance.get<ArrayBuffer>('/workflows/export', {
      params: query,
      responseType: 'arraybuffer',
    });
    return response.data;
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
    return (await this.getEntriesPage(query)).docs;
  }

  async getEntriesPage(
    query: ICostReportEntriesQuery,
  ): Promise<ICostReportEntries> {
    const response = await this.instance.get<JsonApiResponseDocument>(
      '/entries',
      { params: query },
    );
    const docs = deserializeCollection<ICostReportEntry>(response.data);
    const pagination = response.data.links?.pagination;
    return {
      docs,
      limit: pagination?.limit ?? query.limit ?? 50,
      skip: query.skip ?? 0,
      total: pagination?.total ?? docs.length,
    };
  }

  async exportUsageCsv(query: ICostReportQuery): Promise<ArrayBuffer> {
    const response = await this.instance.get<ArrayBuffer>('/usage/export', {
      params: query,
      responseType: 'arraybuffer',
    });
    return response.data;
  }

  async exportCsv(query: ICostReportQuery): Promise<ArrayBuffer> {
    const response = await this.instance.get<ArrayBuffer>('/export', {
      params: query,
      responseType: 'arraybuffer',
    });
    return response.data;
  }
}
