import { API_ENDPOINTS } from '@genfeedai/contracts/constants';
import { Prompt } from '@genfeedai/models/content/prompt.model';
import { PagesService } from '@services/content/pages.service';
import {
  BaseService,
  type JsonApiResponseDocument,
} from '@services/core/base.service';

export class PromptsService extends BaseService<Prompt> {
  constructor(token: string) {
    super(API_ENDPOINTS.PROMPTS, token, Prompt);
  }

  public static getInstance(token: string): PromptsService {
    return BaseService.getDataServiceInstance(PromptsService, token);
  }

  public postRemix(id: string): Promise<Prompt> {
    return this.instance
      .post<JsonApiResponseDocument>(`${id}/remix`, {})
      .then((res) => res.data)
      .then((res) => this.mapOne(res));
  }

  public async postEnhance(id: string): Promise<Prompt> {
    return this.instance
      .patch<JsonApiResponseDocument>(`${id}/enhance`, {})
      .then((res) => res.data)
      .then((res) => this.mapOne(res));
  }

  /**
   * Superadmin: prompts that never produced a generation, across
   * organizations. `findAll` is scoped to the caller's own user.
   */
  public findAdminWithoutGeneration(
    query: Record<string, unknown> = {},
    signal?: AbortSignal,
  ): Promise<Prompt[]> {
    return this.instance
      .get<JsonApiResponseDocument>('admin/without-generation', {
        params: query,
        signal,
      })
      .then(async (response) => {
        const page = await this.mapPage(response.data);
        if ((query as { page?: number }).page) {
          PagesService.setCurrentPage(page.page);
          PagesService.setTotalPages(page.totalPages);
          PagesService.setTotalDocs(page.total);
        }
        return page.items;
      });
  }
}
