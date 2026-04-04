import { AssetSerializer } from '@genfeedai/client/serializers';
import { API_ENDPOINTS } from '@genfeedai/constants';
import { Asset } from '@models/ingredients/asset.model';
import {
  BaseService,
  type JsonApiResponseDocument,
} from '@services/core/base.service';

export class AssetsService extends BaseService<Asset> {
  constructor(token: string) {
    super(API_ENDPOINTS.ASSETS, token, Asset, AssetSerializer);
  }

  public static getInstance(token: string): AssetsService {
    return BaseService.getDataServiceInstance(
      AssetsService,
      token,
    ) as AssetsService;
  }

  public async postUpload(
    formData: FormData,
    progressCallback?: (
      progress: number,
      loaded: number,
      total: number,
    ) => void,
  ) {
    return await this.instance
      .post<JsonApiResponseDocument>(`/upload`, formData, {
        // Track upload progress
        onUploadProgress: (progressEvent) => {
          const percentCompleted = Math.round(
            (progressEvent.loaded * 100) / (progressEvent.total || 1),
          );
          if (progressCallback) {
            progressCallback(
              percentCompleted,
              progressEvent.loaded,
              progressEvent.total || 0,
            );
          }
        },
        // Increase timeout for uploads (5 minutes)
        timeout: 300_000,
      })
      .then((res) => this.mapOne(res.data));
  }

  public async postGenerate(data: {
    parent: string;
    parentModel: string;
    category: string;
    text: string;
    model: string;
  }) {
    return await this.instance
      .post<JsonApiResponseDocument>('/generate', data)
      .then((res) => this.mapOne(res.data));
  }

  public async postFromIngredient(data: {
    ingredientId: string;
    category: string;
    parent: string;
  }) {
    return await this.instance
      .post<JsonApiResponseDocument>('/from-ingredient', data)
      .then((res) => this.mapOne(res.data));
  }
}
