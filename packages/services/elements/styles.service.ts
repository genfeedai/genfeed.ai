import { API_ENDPOINTS } from '@genfeedai/contracts/constants';
import { ElementStyle } from '@genfeedai/models/elements/style.model';
import { BaseService } from '@services/core/base.service';

export class StylesService extends BaseService<ElementStyle> {
  constructor(token: string) {
    super(API_ENDPOINTS.STYLES, token, ElementStyle);
  }

  public static getInstance(token: string): StylesService {
    return BaseService.getDataServiceInstance(StylesService, token);
  }
}
