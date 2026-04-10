import { API_ENDPOINTS } from '@genfeedai/constants';
import { ElementStyle } from '@genfeedai/models/elements/style.model';
import { StyleSerializer } from '@genfeedai/serializers';
import { BaseService } from '@services/core/base.service';

export class StylesService extends BaseService<ElementStyle> {
  constructor(token: string) {
    super(API_ENDPOINTS.STYLES, token, ElementStyle, StyleSerializer);
  }

  public static getInstance(token: string): StylesService {
    return BaseService.getDataServiceInstance(
      StylesService,
      token,
    ) as StylesService;
  }
}
