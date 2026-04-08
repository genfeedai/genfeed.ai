import { API_ENDPOINTS } from '@genfeedai/constants';
import { MemberSerializer } from '@genfeedai/serializers';
import { Member } from '@models/organization/member.model';
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
