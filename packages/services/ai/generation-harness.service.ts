import type {
  GenerationHarnessSettings,
  UpdateGenerationHarnessSettings,
} from '@genfeedai/contracts/interfaces/content/generation-harness.interface';
import { EnvironmentService } from '@services/core/environment.service';
import { HTTPBaseService } from '@services/core/interceptor.service';

export class GenerationHarnessService extends HTTPBaseService {
  constructor(token: string) {
    super(`${EnvironmentService.apiEndpoint}/generation-harness`, token);
  }

  public static getInstance(token: string): GenerationHarnessService {
    return HTTPBaseService.getBaseServiceInstance(
      GenerationHarnessService,
      token,
    ) as GenerationHarnessService;
  }

  public async getSettings(brandId?: string, signal?: AbortSignal): Promise<GenerationHarnessSettings> {
    const response = await this.instance.get<GenerationHarnessSettings>('settings', {
      params: { brandId: brandId || undefined },
      signal,
    });
    return response.data;
  }

  public async updateSettings(input: UpdateGenerationHarnessSettings, signal?: AbortSignal): Promise<GenerationHarnessSettings> {
    const response = await this.instance.patch<GenerationHarnessSettings>('settings', input, { signal });
    return response.data;
  }
}
