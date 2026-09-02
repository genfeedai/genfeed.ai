import { API_ENDPOINTS } from '@genfeedai/contracts/constants';
import type { IMemberInvitation } from '@genfeedai/contracts/interfaces';
import { Member } from '@genfeedai/models/organization/member.model';
import { MemberSerializer } from '@genfeedai/serializers';
import {
  BaseService,
  type JsonApiResponseDocument,
} from '@services/core/base.service';

export class MembersService extends BaseService<Member> {
  constructor(token: string) {
    super(API_ENDPOINTS.MEMBERS, token, Member, MemberSerializer);
  }

  public static getInstance(token: string): MembersService {
    return BaseService.getDataServiceInstance(MembersService, token);
  }

  public async listInvitations(
    status?: IMemberInvitation['status'],
  ): Promise<IMemberInvitation[]> {
    return this.instance
      .get<JsonApiResponseDocument>('/invitations', {
        params: status ? { status } : undefined,
      })
      .then((response) =>
        this.extractCollection<IMemberInvitation>(response.data),
      );
  }

  public async resendInvitation(
    invitationId: string,
  ): Promise<IMemberInvitation> {
    return this.instance
      .post<JsonApiResponseDocument>(`/invitations/${invitationId}/resend`)
      .then((response) =>
        this.extractResource<IMemberInvitation>(response.data),
      );
  }

  public async revokeInvitation(
    invitationId: string,
  ): Promise<IMemberInvitation> {
    return this.instance
      .delete<JsonApiResponseDocument>(`/invitations/${invitationId}`)
      .then((response) =>
        this.extractResource<IMemberInvitation>(response.data),
      );
  }
}
