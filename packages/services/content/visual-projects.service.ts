import type {
  ICancelVisualProject,
  ICreateVisualProject,
  IExportVisualProject,
  IRetryVisualProject,
  IReviseVisualProject,
  IVisualCodeCatalog,
  IVisualCodeQuote,
  IVisualProject,
  VisualCodeQuoteRequest,
} from '@genfeedai/contracts/interfaces';
import { EnvironmentService } from '@services/core/environment.service';
import { HTTPBaseService } from '@services/core/interceptor.service';
import {
  deserializeCollection,
  deserializeResource,
  type JsonApiResponseDocument,
} from '@services/core/json-api';

export class VisualProjectsService extends HTTPBaseService {
  constructor(token: string) {
    super(EnvironmentService.apiEndpoint, token);
  }
  static getInstance(token: string): VisualProjectsService {
    return HTTPBaseService.getBaseServiceInstance(
      VisualProjectsService,
      token,
    ) as VisualProjectsService;
  }
  async catalog(
    brandId: string,
    signal?: AbortSignal,
  ): Promise<IVisualCodeCatalog> {
    const response = await this.instance.get<JsonApiResponseDocument>(
      '/visual-projects/catalog',
      { params: { brandId }, signal },
    );
    return deserializeResource<IVisualCodeCatalog>(response.data);
  }
  async list(brandId: string, cursor?: string, signal?: AbortSignal) {
    const response = await this.instance.get<JsonApiResponseDocument>(
      '/visual-projects/projects',
      { params: { brandId, cursor, limit: 20 }, signal },
    );
    return {
      projects: deserializeCollection<IVisualProject>(response.data),
      nextCursor: response.data.links?.cursor?.nextCursor ?? null,
    };
  }
  async get(
    id: string,
    beforeRevision?: number,
    signal?: AbortSignal,
  ): Promise<IVisualProject> {
    const response = await this.instance.get<JsonApiResponseDocument>(
      `/visual-projects/${encodeURIComponent(id)}`,
      { params: { beforeRevision }, signal },
    );
    return deserializeResource<IVisualProject>(response.data);
  }
  async quote(input: VisualCodeQuoteRequest): Promise<IVisualCodeQuote> {
    const response = await this.instance.post<JsonApiResponseDocument>(
      '/visual-projects/quote',
      input,
    );
    return deserializeResource<IVisualCodeQuote>(response.data);
  }
  async create(input: ICreateVisualProject): Promise<IVisualProject> {
    return this.write('/visual-projects/projects', input);
  }
  async revise(
    id: string,
    input: IReviseVisualProject,
  ): Promise<IVisualProject> {
    return this.write(
      `/visual-projects/${encodeURIComponent(id)}/revisions`,
      input,
    );
  }
  async export(
    id: string,
    input: IExportVisualProject,
  ): Promise<IVisualProject> {
    return this.write(
      `/visual-projects/${encodeURIComponent(id)}/exports`,
      input,
    );
  }
  async retry(id: string, input: IRetryVisualProject): Promise<IVisualProject> {
    return this.write(
      `/visual-projects/${encodeURIComponent(id)}/retry`,
      input,
    );
  }
  async cancel(
    id: string,
    input: ICancelVisualProject,
  ): Promise<IVisualProject> {
    return this.write(
      `/visual-projects/${encodeURIComponent(id)}/cancel`,
      input,
    );
  }
  async source(id: string, revision: number): Promise<string> {
    return (
      await this.instance.get<string>(
        `/visual-projects/${encodeURIComponent(id)}/revisions/${revision}/source`,
        { responseType: 'text', transformResponse: [(value: string) => value] },
      )
    ).data;
  }
  private async write(path: string, input: object): Promise<IVisualProject> {
    return deserializeResource<IVisualProject>(
      (await this.instance.post<JsonApiResponseDocument>(path, input)).data,
    );
  }
}
