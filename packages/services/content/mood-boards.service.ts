import { API_ENDPOINTS } from '@genfeedai/constants';
import { MoodBoard } from '@genfeedai/models/content/mood-board.model';
import { MoodBoardSerializer } from '@genfeedai/serializers';
import {
  BaseService,
  type JsonApiResponseDocument,
} from '@services/core/base.service';

export class MoodBoardsService extends BaseService<MoodBoard> {
  constructor(token: string) {
    super(API_ENDPOINTS.MOOD_BOARDS, token, MoodBoard, MoodBoardSerializer);
  }

  public static getInstance(token: string): MoodBoardsService {
    return BaseService.getDataServiceInstance(
      MoodBoardsService,
      token,
    ) as MoodBoardsService;
  }

  /**
   * Find or create the mood board for a brand via the find-or-create GET
   * endpoint. The server returns a single resource (creating one when absent)
   * when queried with `?brand=<brandId>`, so this parses a single document
   * rather than a collection.
   */
  public getByBrand(brandId: string): Promise<MoodBoard> {
    return this.executeWithErrorHandling(
      `GET ${API_ENDPOINTS.MOOD_BOARDS}?brand=${brandId}`,
      this.instance
        .get<JsonApiResponseDocument>('', { params: { brand: brandId } })
        .then((res) => res.data)
        .then((res) => this.mapOne(res)),
    );
  }
}
