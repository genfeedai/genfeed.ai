import { ByokService } from '@api/services/byok/byok.service';
import { ByokProvider } from '@genfeedai/enums';
import type { ByokResolutionResult } from '@genfeedai/interfaces';
import { ConfigService } from '@libs/config/config.service';
import { Injectable, Optional } from '@nestjs/common';

@Injectable()
export class ByokProviderFactoryService {
  constructor(
    private readonly byokService: ByokService,
    @Optional() private readonly configService?: ConfigService,
  ) {}

  async resolveProvider(
    organizationId: string,
    provider: ByokProvider,
    trackUsage = true,
  ): Promise<ByokResolutionResult> {
    const byokKey = await this.byokService.resolveApiKey(
      organizationId,
      provider,
    );

    if (byokKey?.apiKey) {
      if (trackUsage) {
        // Fire-and-forget usage tracking — errors handled inside incrementUsage
        void this.byokService.incrementUsage(organizationId, provider);
      }

      return {
        apiKey: byokKey.apiKey,
        apiSecret: byokKey.apiSecret,
        source: 'byok',
      };
    }

    const managedApiKey = this.configService?.get('GENFEED_API_KEY');

    if (managedApiKey) {
      return {
        apiKey: managedApiKey,
        managedInferenceUrl:
          this.configService?.get('GENFEED_MANAGED_INFERENCE_URL') ||
          this.buildDefaultManagedInferenceUrl(),
        source: 'managed',
      };
    }

    return { source: 'hosted' };
  }

  async hasProviderAccess(
    organizationId: string,
    provider: ByokProvider,
  ): Promise<boolean> {
    const result = await this.resolveProvider(organizationId, provider, false);

    return result.source === 'hosted' || Boolean(result.apiKey);
  }

  private buildDefaultManagedInferenceUrl(): string | undefined {
    const apiUrl = this.configService?.get('GENFEEDAI_API_URL');
    if (!apiUrl) {
      return undefined;
    }

    return `${apiUrl.replace(/\/+$/, '')}/v1/managed-inference`;
  }
}
