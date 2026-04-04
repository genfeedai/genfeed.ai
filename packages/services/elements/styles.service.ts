import { StyleSerializer } from '@genfeedai/client/serializers';
import { API_ENDPOINTS } from '@genfeedai/constants';
import { ElementStyle } from '@models/elements/style.model';
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
