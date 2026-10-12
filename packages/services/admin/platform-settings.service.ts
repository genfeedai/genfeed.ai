import type {
  IBrandVisionModelOption,
  IBrandVisionModelOptions,
  IPlatformSetting,
  IUpdatePlatformSettingPayload,
} from '@genfeedai/contracts/interfaces';
import { EnvironmentService } from '@services/core/environment.service';
import { HTTPBaseService } from '@services/core/interceptor.service';
import {
  deserializeResource,
  type JsonApiResponseDocument,
} from '@services/core/json-api';

function isBrandVisionModelOption(
  value: unknown,
): value is IBrandVisionModelOption {
  if (!value || typeof value !== 'object') return false;
  const option = value as Record<string, unknown>;
  return (
    typeof option.key === 'string' &&
    typeof option.label === 'string' &&
    typeof option.providerCostUsd === 'number'
  );
}

/** A response without a well-formed option list yields no choices instead of crashing the page. */
function toBrandVisionModelOptions(value: unknown): IBrandVisionModelOption[] {
  return Array.isArray(value) ? value.filter(isBrandVisionModelOption) : [];
}

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

  /** The catalog models eligible for brand OCR and brand detection, with their price. */
  async getBrandVisionModels(
    signal?: AbortSignal,
  ): Promise<IBrandVisionModelOptions> {
    const response = await this.instance.get<JsonApiResponseDocument>(
      'brand-vision-models',
      { signal },
    );
    const options = deserializeResource<Partial<IBrandVisionModelOptions>>(
      response.data,
    );
    return {
      detect: toBrandVisionModelOptions(options.detect),
      id: options.id ?? 'brand-vision-models',
      ocr: toBrandVisionModelOptions(options.ocr),
    };
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
