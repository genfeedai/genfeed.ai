import { API_ENDPOINTS } from '@genfeedai/contracts/constants';
import { Training } from '@genfeedai/models/ai/training.model';
import { Image } from '@genfeedai/models/ingredients/image.model';
import { PagesService } from '@services/content/pages.service';
import {
  BaseService,
  type JsonApiResponseDocument,
} from '@services/core/base.service';

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
  ): Promise<Image[]> {
    return await this.instance
      .get<JsonApiResponseDocument>(`/${trainingId}/images`, {
        params: query,
        signal,
      })
      .then((res) => {
        const document = res.data;
        const pagination = document.links?.pagination;

        if (query?.page && pagination) {
          PagesService.setCurrentPage(pagination.page);
          PagesService.setTotalPages(pagination.pages);
          PagesService.setTotalDocs(pagination.total ?? 0);
        }

        return this.extractCollection<Partial<Image>>(document).map(
          (image) => new Image(image),
        );
      });
  }

  /**
   * Get source images for a training
   */
  async getTrainingSources(
    trainingId: string,
    query?: { page?: number; [key: string]: unknown },
    signal?: AbortSignal,
  ): Promise<Image[]> {
    return await this.instance
      .get<JsonApiResponseDocument>(`/${trainingId}/sources`, {
        params: query,
        signal,
      })
      .then((res) => {
        const document = res.data;
        const pagination = document.links?.pagination;

        if (query?.page && pagination) {
          PagesService.setCurrentPage(pagination.page);
          PagesService.setTotalPages(pagination.pages);
          PagesService.setTotalDocs(pagination.total ?? 0);
        }

        return this.extractCollection<Partial<Image>>(document).map(
          (image) => new Image(image),
        );
      });
  }
}
