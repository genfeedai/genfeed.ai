import { API_ENDPOINTS } from '@genfeedai/contracts/constants';
import type {
  IBrand,
  INotificationPreference,
  IOrganization,
  IQueryParams,
  ISetting,
  IUser,
} from '@genfeedai/contracts/interfaces';
import { Setting } from '@genfeedai/models/analytics/setting.model';
import { User } from '@genfeedai/models/auth/user.model';
import { Brand } from '@genfeedai/models/organization/brand.model';
import { Organization } from '@genfeedai/models/organization/organization.model';
import {
  NotificationPreferenceSerializer,
  SettingSerializer,
  UserSerializer,
} from '@genfeedai/serializers';
import {
  BaseService,
  type JsonApiResponseDocument,
} from '@services/core/base.service';

export class UsersService extends BaseService<User> {
  constructor(token: string) {
    super(API_ENDPOINTS.USERS, token, User, UserSerializer);
  }

  public static getInstance(token: string): UsersService {
    return BaseService.getDataServiceInstance(UsersService, token);
  }

  private async findMeBrandsPage(
    params: IQueryParams,
  ): Promise<{ items: Brand[]; totalPages: number }> {
    return await this.instance
      .get<JsonApiResponseDocument>('me/brands', { params })
      .then((res) => ({
        items: this.extractCollection<Partial<Brand>>(res.data).map(
          (b) => new Brand(b),
        ),
        totalPages: Math.max(1, res.data.links?.pagination?.pages ?? 1),
      }));
  }

  public async findMeBrands(params: IQueryParams): Promise<Brand[]> {
    return (await this.findMeBrandsPage(params)).items;
  }

  /**
   * Every brand the signed-in user can reach, across all server pages.
   *
   * `me/brands` is paginated server-side like any other list endpoint, so the
   * brand switcher has to walk the pages rather than pass the ignored
   * `pagination: false`.
   */
  public async findAllMeBrands(params: IQueryParams = {}): Promise<Brand[]> {
    return await this.collectAllPages<Brand>(params, (pageQuery) =>
      this.findMeBrandsPage(pageQuery as IQueryParams),
    );
  }

  public async findMeOrganizations(): Promise<IOrganization[]> {
    return await this.instance
      .get<JsonApiResponseDocument>('me/organizations')
      .then((res) =>
        this.extractCollection<IOrganization>(res.data).map(
          (o) => new Organization(o),
        ),
      );
  }

  public async patchMeBrand(
    id: string,
    brand: Partial<IBrand>,
  ): Promise<IBrand> {
    return await this.instance
      .patch<JsonApiResponseDocument>(`me/brands/${id}`, brand)
      .then((res) => res.data)
      .then((res) => new Brand(this.extractResource<Partial<IBrand>>(res)));
  }

  public async clearMeBrandSelection(): Promise<IUser> {
    return await this.patchMe({ selectedBrandId: null });
  }

  public async patchSettings(
    id: string,
    settings: Partial<ISetting>,
  ): Promise<ISetting> {
    const data = SettingSerializer.serialize(settings);
    return await this.instance
      .patch<JsonApiResponseDocument>(`/${id}/settings`, data)
      .then((res) => res.data)
      .then((res) => new Setting(this.extractResource<Partial<ISetting>>(res)));
  }

  public async patchMeSettings(settings: Partial<ISetting>): Promise<ISetting> {
    const data = SettingSerializer.serialize(settings);
    return await this.instance
      .patch<JsonApiResponseDocument>('me/settings', data)
      .then((res) => res.data)
      .then((res) => new Setting(this.extractResource<Partial<ISetting>>(res)));
  }

  public async findWorkflowEmailNotificationPreference(
    signal?: AbortSignal,
  ): Promise<INotificationPreference> {
    return await this.instance
      .get<JsonApiResponseDocument>(
        'me/notification-preferences/workflow-status/email',
        { signal },
      )
      .then((res) => this.extractResource<INotificationPreference>(res.data));
  }

  public async patchWorkflowEmailNotificationPreference(
    isEnabled: boolean,
  ): Promise<INotificationPreference> {
    const data = NotificationPreferenceSerializer.serialize({ isEnabled });
    return await this.instance
      .patch<JsonApiResponseDocument>(
        'me/notification-preferences/workflow-status/email',
        data,
      )
      .then((res) => this.extractResource<INotificationPreference>(res.data));
  }

  public async findMe(): Promise<IUser> {
    return await this.instance
      .get<JsonApiResponseDocument>('me')
      .then((res) => this.mapOne(res.data));
  }

  public async patchMe(
    body: Partial<IUser> & { selectedBrandId?: string | null },
  ): Promise<IUser> {
    return await this.instance
      .patch<JsonApiResponseDocument>('me', body)
      .then((res) => this.mapOne(res.data));
  }

  /**
   * First-asset unlock gate — persist the per-user "explore anyway" escape hatch.
   * The API also invalidates the access-bootstrap cache so the next bootstrap
   * reflects the dismissal.
   */
  public async dismissAssetGate(): Promise<IUser> {
    return await this.instance
      .patch<JsonApiResponseDocument>('me/asset-gate', {
        hasDismissedAssetGate: true,
      })
      .then((res) => this.mapOne(res.data));
  }
}
