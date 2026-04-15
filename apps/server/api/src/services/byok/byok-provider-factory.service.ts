import { ByokService } from '@api/services/byok/byok.service';
import { ByokProvider } from '@genfeedai/enums';
import type { ByokResolutionResult } from '@genfeedai/interfaces';
import { Injectable } from '@nestjs/common';

@Injectable()
export class ByokProviderFactoryService {
  constructor(private readonly byokService: ByokService) {}

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

    return { source: 'hosted' };
  }

  async hasProviderAccess(
    organizationId: string,
    provider: ByokProvider,
  ): Promise<boolean> {
    const result = await this.resolveProvider(organizationId, provider, false);

    return result.source === 'hosted' || Boolean(result.apiKey);
  }
}
