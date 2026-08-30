import { API_ENDPOINTS } from '@genfeedai/constants';
import type {
  ISavedAd,
  SaveAdInput,
  UnsaveSavedAdInput,
  UpdateSavedAdNoteInput,
} from '@genfeedai/interfaces';
import { EnvironmentService } from '@services/core/environment.service';
import { HTTPBaseService } from '@services/core/interceptor.service';
import {
  extractCollection,
  type JsonApiResponseDocument,
} from '@services/core/json-api';

export class SavedAdsService extends HTTPBaseService {
  constructor(token: string) {
    super(`${EnvironmentService.apiEndpoint}${API_ENDPOINTS.SAVED_ADS}`, token);
  }

  public static getInstance(token: string): SavedAdsService {
    return HTTPBaseService.getBaseServiceInstance(
      SavedAdsService,
      token,
    ) as SavedAdsService;
  }

  async list(brandId: string): Promise<ISavedAd[]> {
    return this.instance
      .get<JsonApiResponseDocument>('', { params: { brandId } })
      .then((response) => extractCollection<ISavedAd>(response.data));
  }

  async save(inputs: SaveAdInput[]): Promise<ISavedAd[]> {
    return this.instance
      .post<JsonApiResponseDocument>('', inputs)
      .then((response) => extractCollection<ISavedAd>(response.data));
  }

  async updateNotes(inputs: UpdateSavedAdNoteInput[]): Promise<ISavedAd[]> {
    return this.instance
      .patch<JsonApiResponseDocument>('', inputs)
      .then((response) => extractCollection<ISavedAd>(response.data));
  }

  async unsave(inputs: UnsaveSavedAdInput[]): Promise<void> {
    await this.instance.delete('', { data: inputs });
  }
}
