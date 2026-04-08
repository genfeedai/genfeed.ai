import { API_ENDPOINTS } from '@genfeedai/constants';
import { FontFamilySerializer } from '@genfeedai/serializers';
import { FontFamily } from '@models/elements/font-family.model';
import { BaseService } from '@services/core/base.service';

export class FontFamiliesService extends BaseService<FontFamily> {
  constructor(token: string) {
    super(API_ENDPOINTS.FONT_FAMILIES, token, FontFamily, FontFamilySerializer);
  }

  public static getInstance(token: string): FontFamiliesService {
    return BaseService.getDataServiceInstance(
      FontFamiliesService,
      token,
    ) as FontFamiliesService;
  }
}
