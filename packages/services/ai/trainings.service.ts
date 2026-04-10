import { API_ENDPOINTS } from '@genfeedai/constants';
import { Training } from '@genfeedai/models/ai/training.model';
import { Image } from '@genfeedai/models/ingredients/image.model';
import { TrainingSerializer } from '@genfeedai/serializers';
import { PagesService } from '@services/content/pages.service';
import {
  BaseService,
  type JsonApiResponseDocument,
} from '@services/core/base.service';

export class TrainingsService extends BaseService<Training> {
  constructor(token: string) {
    super(API_ENDPOINTS.TRAININGS, token, Training, TrainingSerializer);
  }

  public static getInstance(token: string): TrainingsService {
    return BaseService.getDataServiceInstance(
      TrainingsService,
      token,
    ) as TrainingsService;
  }

  /**
   * Get generated images for a training
   */
  async getTrainingImages(
    trainingId: string,
    query?: { page?: number; [key: string]: unknown },
  ): Promise<Image[]> {
    return await this.instance
      .get<JsonApiResponseDocument>(`/${trainingId}/images`, { params: query })
      .then((res) => {
        const document = res.data;
        const pagination = document.links?.pagination;

        if (query?.page && pagination) {
          PagesService.setCurrentPage(pagination.page);
          PagesService.setTotalPages(pagination.pages);
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
  ): Promise<Image[]> {
    return await this.instance
      .get<JsonApiResponseDocument>(`/${trainingId}/sources`)
      .then((res) => {
        const document = res.data;
        const pagination = document.links?.pagination;

        if (query?.page && pagination) {
          PagesService.setCurrentPage(pagination.page);
          PagesService.setTotalPages(pagination.pages);
        }

        return this.extractCollection<Partial<Image>>(document).map(
          (image) => new Image(image),
        );
      });
  }
}
