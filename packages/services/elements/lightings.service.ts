import { API_ENDPOINTS } from '@genfeedai/contracts/constants';
import { ElementLighting } from '@genfeedai/models/elements/lighting.model';
import { BaseService } from '@services/core/base.service';

export class LightingsService extends BaseService<ElementLighting> {
  constructor(token: string) {
    super(API_ENDPOINTS.LIGHTINGS, token, ElementLighting);
  }

  public static getInstance(token: string): LightingsService {
    return BaseService.getDataServiceInstance(LightingsService, token);
  }
}
