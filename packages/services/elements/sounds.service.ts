import { SoundSerializer } from '@genfeedai/client/serializers';
import { API_ENDPOINTS } from '@genfeedai/constants';
import { Sound } from '@models/ingredients/sound.model';
import { BaseService } from '@services/core/base.service';

export class SoundsService extends BaseService<Sound> {
  constructor(token: string) {
    super(API_ENDPOINTS.SOUNDS, token, Sound, SoundSerializer);
  }

  public static getInstance(token: string): SoundsService {
    return BaseService.getDataServiceInstance(
      SoundsService,
      token,
    ) as SoundsService;
  }
}
