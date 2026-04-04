import { MoodSerializer } from '@genfeedai/client/serializers';
import { API_ENDPOINTS } from '@genfeedai/constants';
import { ElementMood } from '@models/elements/mood.model';
import { BaseService } from '@services/core/base.service';

export class MoodsService extends BaseService<ElementMood> {
  constructor(token: string) {
    super(API_ENDPOINTS.MOODS, token, ElementMood, MoodSerializer);
  }

  public static getInstance(token: string): MoodsService {
    return BaseService.getDataServiceInstance(
      MoodsService,
      token,
    ) as MoodsService;
  }
}
