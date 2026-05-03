import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { ByokService } from '@api/services/byok/byok.service';
import { ByokProvider } from '@genfeedai/enums';
import type {
  ITopbarBalanceSegment,
  ITopbarBalances,
} from '@genfeedai/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';

const PROVIDER_BALANCE_TIMEOUT_MS = 2500;

@Injectable()
export class TopbarBalancesService {
  constructor(
    private readonly creditsUtilsService: CreditsUtilsService,
    private readonly byokService: ByokService,
    private readonly httpService: HttpService,
    private readonly loggerService: LoggerService,
  ) {}

  async getTopbarBalances(organizationId: string): Promise<ITopbarBalances> {
    const generatedAt = new Date().toISOString();
    const genfeedBalance =
      await this.creditsUtilsService.getOrganizationCreditsBalance(
        organizationId,
      );

    const providerSegments = await Promise.all([
      this.getProviderSegment(organizationId, ByokProvider.REPLICATE),
      this.getProviderSegment(organizationId, ByokProvider.FAL),
    ]);

    return {
      generatedAt,
      segments: [
        {
          balance: genfeedBalance,
          currencyOrUnit: 'credits',
          label: 'Genfeed',
          lastSyncedAt: generatedAt,
          provider: 'genfeed',
          status: 'available',
        },
        ...providerSegments.filter(
          (segment): segment is ITopbarBalanceSegment => Boolean(segment),
        ),
      ],
    };
  }

  private async getProviderSegment(
    organizationId: string,
    provider: ByokProvider.REPLICATE | ByokProvider.FAL,
  ): Promise<ITopbarBalanceSegment | null> {
    const credentials = await this.byokService.resolveApiKey(
      organizationId,
      provider,
    );

    if (!credentials) {
      return null;
    }

    try {
      if (provider === ByokProvider.FAL) {
        return await this.getFalBalance(credentials.apiKey);
      }

      return await this.getReplicateBalance(credentials.apiKey);
    } catch (error: unknown) {
      this.loggerService.warn('Topbar provider balance lookup failed', {
        error,
        provider,
      });

      return this.unavailableSegment(
        provider,
        error instanceof Error ? error.message : 'Balance unavailable',
      );
    }
  }

  private async getFalBalance(apiKey: string): Promise<ITopbarBalanceSegment> {
    const response = await firstValueFrom(
      this.httpService.get<{
        credits?: { current_balance?: number; currency?: string };
      }>('https://api.fal.ai/v1/account/billing?expand=credits', {
        headers: { Authorization: `Key ${apiKey}` },
        timeout: PROVIDER_BALANCE_TIMEOUT_MS,
      }),
    );
    const credits = response.data.credits;
    const balance = credits?.current_balance;

    if (typeof balance !== 'number') {
      throw new Error('fal.ai billing response did not include credits');
    }

    return {
      balance,
      currencyOrUnit: credits?.currency ?? 'USD',
      label: 'fal.ai',
      lastSyncedAt: new Date().toISOString(),
      provider: ByokProvider.FAL,
      status: 'available',
    };
  }

  private async getReplicateBalance(
    apiKey: string,
  ): Promise<ITopbarBalanceSegment> {
    const response = await firstValueFrom(
      this.httpService.get<Record<string, unknown>>(
        'https://api.replicate.com/v1/account',
        {
          headers: { Authorization: `Bearer ${apiKey}` },
          timeout: PROVIDER_BALANCE_TIMEOUT_MS,
        },
      ),
    );
    const balance = this.extractNumericBalance(response.data);

    if (typeof balance !== 'number') {
      throw new Error('Replicate account API did not expose a credit balance');
    }

    return {
      balance,
      currencyOrUnit: 'USD',
      label: 'Replicate',
      lastSyncedAt: new Date().toISOString(),
      provider: ByokProvider.REPLICATE,
      status: 'available',
    };
  }

  private extractNumericBalance(data: Record<string, unknown>): number | null {
    const directKeys = [
      'balance',
      'credit_balance',
      'creditBalance',
      'credits',
    ];

    for (const key of directKeys) {
      if (typeof data[key] === 'number') {
        return data[key];
      }
    }

    const billing = data.billing as Record<string, unknown> | undefined;
    const credit = data.credit as Record<string, unknown> | undefined;
    const nestedBalance =
      billing?.balance ??
      billing?.credit_balance ??
      billing?.creditBalance ??
      credit?.balance;

    return typeof nestedBalance === 'number' ? nestedBalance : null;
  }

  private unavailableSegment(
    provider: ByokProvider.REPLICATE | ByokProvider.FAL,
    error: string,
  ): ITopbarBalanceSegment {
    return {
      balance: null,
      currencyOrUnit: provider === ByokProvider.FAL ? 'USD' : 'USD',
      error,
      label: provider === ByokProvider.FAL ? 'fal.ai' : 'Replicate',
      lastSyncedAt: new Date().toISOString(),
      provider,
      status: 'unavailable',
    };
  }
}
