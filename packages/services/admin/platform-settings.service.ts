import type {
  IPlatformSetting,
  IUpdatePlatformSettingPayload,
} from '@genfeedai/interfaces';
import { EnvironmentService } from '@services/core/environment.service';
import { HTTPBaseService } from '@services/core/interceptor.service';
import {
  deserializeResource,
  type JsonApiResponseDocument,
} from '@services/core/json-api';

export class AdminPlatformSettingsService extends HTTPBaseService {
  constructor(token: string) {
    super(`${EnvironmentService.apiEndpoint}/admin/platform-settings`, token);
  }

  public static getInstance(token: string): AdminPlatformSettingsService {
    return HTTPBaseService.getBaseServiceInstance(
      AdminPlatformSettingsService,
      token,
    ) as AdminPlatformSettingsService;
  }

  async getSettings(signal?: AbortSignal): Promise<IPlatformSetting> {
    const response = await this.instance.get<JsonApiResponseDocument>('', {
      signal,
    });
    return deserializeResource<IPlatformSetting>(response.data);
  }

  async updateSettings(
    data: IUpdatePlatformSettingPayload,
  ): Promise<IPlatformSetting> {
    const response = await this.instance.patch<JsonApiResponseDocument>(
      '',
      data,
    );
    return deserializeResource<IPlatformSetting>(response.data);
  }
}
