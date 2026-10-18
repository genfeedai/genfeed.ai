import { API_ENDPOINTS } from '@genfeedai/contracts/constants';
import { Vote } from '@genfeedai/models/analytics/vote.model';
import { BaseService } from '@services/core/base.service';

export class VotesService extends BaseService<Vote> {
  constructor(token: string) {
    super(API_ENDPOINTS.VOTES, token, Vote);
  }

  public static getInstance(token: string): VotesService {
    return BaseService.getDataServiceInstance(VotesService, token);
  }

  public async removeByEntity(entityId: string): Promise<void> {
    await this.instance.delete('', { params: { entity: entityId } });
  }
}
