import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { TopbarBalancesService } from '@api/collections/credits/services/topbar-balances.service';
import { ByokService } from '@api/services/byok/byok.service';
import { ByokProvider } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpService } from '@nestjs/axios';
import { of, throwError } from 'rxjs';

describe('TopbarBalancesService', () => {
  const creditsUtilsService = {
    getOrganizationCreditsBalance: vi.fn(),
  };
  const byokService = {
    resolveApiKey: vi.fn(),
  };
  const httpService = {
    get: vi.fn(),
  };
  const loggerService = {
    warn: vi.fn(),
  };

  let service: TopbarBalancesService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new TopbarBalancesService(
      creditsUtilsService as unknown as CreditsUtilsService,
      byokService as unknown as ByokService,
      httpService as unknown as HttpService,
      loggerService as unknown as LoggerService,
    );
    creditsUtilsService.getOrganizationCreditsBalance.mockResolvedValue(840);
    byokService.resolveApiKey.mockResolvedValue(undefined);
  });

  it('always includes the Genfeed credit balance', async () => {
    const result = await service.getTopbarBalances('org_1');

    expect(result.segments).toEqual([
      expect.objectContaining({
        balance: 840,
        currencyOrUnit: 'credits',
        label: 'Genfeed',
        provider: 'genfeed',
        status: 'available',
      }),
    ]);
  });

  it('includes connected fal.ai balances', async () => {
    byokService.resolveApiKey.mockImplementation(
      async (_orgId: string, provider: ByokProvider) =>
        provider === ByokProvider.FAL ? { apiKey: 'fal-key' } : undefined,
    );
    httpService.get.mockReturnValue(
      of({
        data: {
          credits: { current_balance: 24.5, currency: 'USD' },
        },
      }),
    );

    const result = await service.getTopbarBalances('org_1');

    expect(httpService.get).toHaveBeenCalledWith(
      'https://api.fal.ai/v1/account/billing?expand=credits',
      expect.objectContaining({
        headers: { Authorization: 'Key fal-key' },
        timeout: 2500,
      }),
    );
    expect(result.segments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          balance: 24.5,
          currencyOrUnit: 'USD',
          label: 'fal.ai',
          provider: ByokProvider.FAL,
          status: 'available',
        }),
      ]),
    );
  });

  it('marks provider segments unavailable without blocking the pill', async () => {
    byokService.resolveApiKey.mockImplementation(
      async (_orgId: string, provider: ByokProvider) =>
        provider === ByokProvider.REPLICATE
          ? { apiKey: 'replicate-key' }
          : undefined,
    );
    httpService.get.mockReturnValue(throwError(() => new Error('timeout')));

    const result = await service.getTopbarBalances('org_1');

    expect(result.segments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          balance: 840,
          provider: 'genfeed',
          status: 'available',
        }),
        expect.objectContaining({
          balance: null,
          label: 'Replicate',
          provider: ByokProvider.REPLICATE,
          status: 'unavailable',
        }),
      ]),
    );
  });
});
