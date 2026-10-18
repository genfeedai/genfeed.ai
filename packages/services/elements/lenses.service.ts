import { API_ENDPOINTS } from '@genfeedai/contracts/constants';
import { ElementLens } from '@genfeedai/models/elements/lens.model';
import { BaseService } from '@services/core/base.service';

export class LensesService extends BaseService<ElementLens> {
  constructor(token: string) {
    super(API_ENDPOINTS.LENSES, token, ElementLens);
  }

  public static getInstance(token: string): LensesService {
    return BaseService.getDataServiceInstance(LensesService, token);
  }
}
