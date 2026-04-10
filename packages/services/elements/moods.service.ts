import { API_ENDPOINTS } from '@genfeedai/constants';
import { ElementMood } from '@genfeedai/models/elements/mood.model';
import { MoodSerializer } from '@genfeedai/serializers';
import { BaseService } from '@services/core/base.service';

export class MoodsService extends BaseService<ElementMood> {
  constructor(token: string) {
    super(API_ENDPOINTS.MOODS, token, ElementMood, MoodSerializer);
  }

  public static getInstance(token: string): MoodsService {
    return BaseService.getInstance.call(MoodsService, token) as MoodsService;
  }
}
