import type {
  IBrand,
  IOrganization,
  IQueryParams,
  ISetting,
  IUser,
} from '@genfeedai/interfaces';
import {
  SettingSerializer,
  UserSerializer,
} from '@genfeedai/client/serializers';
import { API_ENDPOINTS } from '@genfeedai/constants';
import { Setting } from '@models/analytics/setting.model';
import { User } from '@models/auth/user.model';
import { Brand } from '@models/organization/brand.model';
import { Organization } from '@models/organization/organization.model';
import {
  BaseService,
  type JsonApiResponseDocument,
} from '@services/core/base.service';

export class UsersService extends BaseService<User> {
  constructor(token: string) {
    super(API_ENDPOINTS.USERS, token, User, UserSerializer);
  }

  public static getInstance(token: string): UsersService {
    return BaseService.getDataServiceInstance(
      UsersService,
      token,
    ) as UsersService;
  }

  public async findMeBrands(params: IQueryParams) {
    return await this.instance
      .get<JsonApiResponseDocument>('me/brands', { params })
      .then((res) =>
        this.extractCollection<Partial<Brand>>(res.data).map(
          (b) => new Brand(b),
        ),
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

  public async findMe(): Promise<IUser> {
    return await this.instance
      .get<JsonApiResponseDocument>('me')
      .then((res) => this.mapOne(res.data));
  }

  public async patchMe(body: Partial<IUser>): Promise<IUser> {
    return await this.instance
      .patch<JsonApiResponseDocument>('me', body)
      .then((res) => this.mapOne(res.data));
  }
}
