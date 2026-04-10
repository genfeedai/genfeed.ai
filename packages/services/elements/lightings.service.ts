import { API_ENDPOINTS } from '@genfeedai/constants';
import { ElementLighting } from '@genfeedai/models/elements/lighting.model';
import { LightingSerializer } from '@genfeedai/serializers';
import { BaseService } from '@services/core/base.service';

export class LightingsService extends BaseService<ElementLighting> {
  constructor(token: string) {
    super(API_ENDPOINTS.LIGHTINGS, token, ElementLighting, LightingSerializer);
  }

  public static getInstance(token: string): LightingsService {
    return BaseService.getDataServiceInstance(
      LightingsService,
      token,
    ) as LightingsService;
  }
}
