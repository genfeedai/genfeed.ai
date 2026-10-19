import { API_ENDPOINTS, MAX_PAGE_SIZE } from '@genfeedai/contracts/constants';
import type {
  ISavedAd,
  SaveAdInput,
  UnsaveSavedAdInput,
  UpdateSavedAdNoteInput,
} from '@genfeedai/contracts/interfaces';
import { EnvironmentService } from '@services/core/environment.service';
import { HTTPBaseService } from '@services/core/interceptor.service';
import {
  extractCollection,
  type JsonApiResponseDocument,
} from '@services/core/json-api';

/** Safety ceiling for the page walk: 50 x 100 saved ads. */
const MAX_SAVED_AD_PAGES = 50;

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

  /** Every saved ad for the brand, walking the API's pages. */
  async list(brandId: string, signal?: AbortSignal): Promise<ISavedAd[]> {
    const savedAds: ISavedAd[] = [];
    let totalPages = 1;

    for (
      let page = 1;
      page <= Math.min(totalPages, MAX_SAVED_AD_PAGES);
      page += 1
    ) {
      const response = await this.instance.get<JsonApiResponseDocument>('', {
        params: { brandId, limit: MAX_PAGE_SIZE, page },
        signal,
      });
      savedAds.push(...extractCollection<ISavedAd>(response.data));
      totalPages = response.data.links?.pagination?.pages ?? 1;
    }

    return savedAds;
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
