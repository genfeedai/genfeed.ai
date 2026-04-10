import { API_ENDPOINTS } from '@genfeedai/constants';
import { ElementLens } from '@genfeedai/models/elements/lens.model';
import { LensSerializer } from '@genfeedai/serializers';
import { BaseService } from '@services/core/base.service';

export class LensesService extends BaseService<ElementLens> {
  constructor(token: string) {
    super(API_ENDPOINTS.LENSES, token, ElementLens, LensSerializer);
  }

  public static getInstance(token: string): LensesService {
    return BaseService.getDataServiceInstance(
      LensesService,
      token,
    ) as LensesService;
  }
}
