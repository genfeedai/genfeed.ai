import { API_ENDPOINTS } from '@genfeedai/constants';
import { PromptSerializer } from '@genfeedai/serializers';
import { Prompt } from '@models/content/prompt.model';
import {
  BaseService,
  type JsonApiResponseDocument,
} from '@services/core/base.service';

export class PromptsService extends BaseService<Prompt> {
  constructor(token: string) {
    super(API_ENDPOINTS.PROMPTS, token, Prompt, PromptSerializer);
  }

  public static getInstance(token: string): PromptsService {
    return BaseService.getDataServiceInstance(
      PromptsService,
      token,
    ) as PromptsService;
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
}
