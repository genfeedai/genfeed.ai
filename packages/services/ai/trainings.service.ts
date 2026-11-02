import { API_ENDPOINTS } from '@genfeedai/contracts/constants';
import type { IPaginatedResponse } from '@genfeedai/contracts/interfaces';
import { Training } from '@genfeedai/models/ai/training.model';
import { Image } from '@genfeedai/models/ingredients/image.model';
import {
  BaseService,
  type JsonApiResponseDocument,
} from '@services/core/base.service';
import { toPaginatedResponse } from '@services/core/paginated-response';

export class TrainingsService extends BaseService<Training> {
  constructor(token: string) {
    super(API_ENDPOINTS.TRAININGS, token, Training);
  }

  public static getInstance(token: string): TrainingsService {
    return BaseService.getDataServiceInstance(TrainingsService, token);
  }

  /**
   * Get generated images for a training
   */
  async getTrainingImages(
    trainingId: string,
    query?: { page?: number; [key: string]: unknown },
    signal?: AbortSignal,
  ): Promise<IPaginatedResponse<Image>> {
    return await this.instance
      .get<JsonApiResponseDocument>(`/${trainingId}/images`, {
        params: query,
        signal,
      })
      .then((res) => {
        const document = res.data;
        const items = this.extractCollection<Partial<Image>>(document).map(
          (image) => new Image(image),
        );
        return toPaginatedResponse(items, document);
      });
  }

  /**
   * Get source images for a training
   */
  async getTrainingSources(
    trainingId: string,
    query?: { page?: number; [key: string]: unknown },
    signal?: AbortSignal,
  ): Promise<IPaginatedResponse<Image>> {
    return await this.instance
      .get<JsonApiResponseDocument>(`/${trainingId}/sources`, {
        params: query,
        signal,
      })
      .then((res) => {
        const document = res.data;
        const items = this.extractCollection<Partial<Image>>(document).map(
          (image) => new Image(image),
        );
        return toPaginatedResponse(items, document);
      });
  }
}
