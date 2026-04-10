import { API_ENDPOINTS } from '@genfeedai/constants';
import { FontFamily } from '@genfeedai/models/elements/font-family.model';
import { FontFamilySerializer } from '@genfeedai/serializers';
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
