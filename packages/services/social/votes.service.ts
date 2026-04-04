import { VoteSerializer } from '@genfeedai/client/serializers';
import { API_ENDPOINTS } from '@genfeedai/constants';
import { Vote } from '@models/analytics/vote.model';
import { BaseService } from '@services/core/base.service';

export class VotesService extends BaseService<Vote> {
  constructor(token: string) {
    super(API_ENDPOINTS.VOTES, token, Vote, VoteSerializer);
  }

  public static getInstance(token: string): VotesService {
    return BaseService.getDataServiceInstance(
      VotesService,
      token,
    ) as VotesService;
  }
}
