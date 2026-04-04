import { LensSerializer } from '@genfeedai/client/serializers';
import { API_ENDPOINTS } from '@genfeedai/constants';
import { ElementLens } from '@models/elements/lens.model';
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
