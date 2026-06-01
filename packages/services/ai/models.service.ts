import { Model } from '@genfeedai/client/models';
import { API_ENDPOINTS } from '@genfeedai/constants';
import { ModelSerializer } from '@genfeedai/serializers';
import { BaseService } from '@services/core/base.service';

export class ModelsService extends BaseService<Model> {
  constructor(token: string) {
    super(API_ENDPOINTS.MODELS, token, Model, ModelSerializer);
  }

  public static getInstance(token: string): ModelsService {
    return BaseService.getDataServiceInstance(ModelsService, token);
  }

  public approveRegistryModel(
    id: string,
    body: Partial<Model> = {},
  ): Promise<Model> {
    return this.executeWithErrorHandling(
      `PATCH ${this.baseURL}/${id}/approve`,
      this.instance
        .patch(`/${id}/approve`, body)
        .then((res) => res.data)
        .then(async (res) => await this.mapOne(res)),
    );
  }

  public rejectRegistryModel(id: string, reason?: string): Promise<Model> {
    return this.executeWithErrorHandling(
      `PATCH ${this.baseURL}/${id}/reject`,
      this.instance
        .patch(`/${id}/reject`, { reason })
        .then((res) => res.data)
        .then(async (res) => await this.mapOne(res)),
    );
  }

  public markRegistryModelLegacy(
    id: string,
    succeededBy?: string,
  ): Promise<Model> {
    return this.executeWithErrorHandling(
      `PATCH ${this.baseURL}/${id}/legacy`,
      this.instance
        .patch(`/${id}/legacy`, { succeededBy })
        .then((res) => res.data)
        .then(async (res) => await this.mapOne(res)),
    );
  }
}
