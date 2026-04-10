import { API_ENDPOINTS } from '@genfeedai/constants';
import { Member } from '@genfeedai/models/organization/member.model';
import { MemberSerializer } from '@genfeedai/serializers';
import { BaseService } from '@services/core/base.service';

export class MembersService extends BaseService<Member> {
  constructor(token: string) {
    super(API_ENDPOINTS.MEMBERS, token, Member, MemberSerializer);
  }

  public static getInstance(token: string): MembersService {
    return BaseService.getDataServiceInstance(
      MembersService,
      token,
    ) as MembersService;
  }
}
