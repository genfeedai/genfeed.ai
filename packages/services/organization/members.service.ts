import {
  API_ENDPOINTS,
  type NativeSecondaryAppId,
  normalizeInstalledAppIds,
} from '@genfeedai/contracts/constants';
import type {
  IMemberInvitation,
  MemberAppsResponse,
} from '@genfeedai/contracts/interfaces';
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

  /** #5502 the caller's installed native apps in the session organization. */
  public async findMyApps(
    signal?: AbortSignal,
  ): Promise<NativeSecondaryAppId[]> {
    return this.instance
      .get<MemberAppsResponse>('/me/apps', { signal })
      .then((response) =>
        normalizeInstalledAppIds(response.data.installedAppIds),
      );
  }

  public async installApp(
    appId: NativeSecondaryAppId,
  ): Promise<NativeSecondaryAppId[]> {
    return this.instance
      .put<MemberAppsResponse>(`/me/apps/${appId}`)
      .then((response) =>
        normalizeInstalledAppIds(response.data.installedAppIds),
      );
  }

  public async uninstallApp(
    appId: NativeSecondaryAppId,
  ): Promise<NativeSecondaryAppId[]> {
    return this.instance
      .delete<MemberAppsResponse>(`/me/apps/${appId}`)
      .then((response) =>
        normalizeInstalledAppIds(response.data.installedAppIds),
      );
  }
}
