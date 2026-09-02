import type { ITopbarBalances } from '@genfeedai/contracts/interfaces';
import { EnvironmentService } from '@services/core/environment.service';
import { HTTPBaseService } from '@services/core/interceptor.service';
import {
  deserializeResource,
  type JsonApiResponseDocument,
} from '@services/core/json-api';

const TOPBAR_BALANCES_TIMEOUT_MS = 5_000;

export interface ByokUsageSummary {
  totalUsage: number;
  freeThreshold: number;
  freeRemaining: number;
  billableUsage: number;
  projectedFee: number;
  billingStatus: string;
  rollover: number;
  periodStart: string;
  periodEnd: string;
}

export interface CreditUsageSeriesPoint {
  date: string;
  amount: number;
}

export interface CreditUsageMetrics {
  currentBalance: number;
  usage7Days: number;
  usage30Days: number;
  trendPercentage: number;
  breakdown: Array<{ source: string; amount: number; count: number }>;
  dailySeries?: CreditUsageSeriesPoint[];
  weeklySeries?: CreditUsageSeriesPoint[];
  monthlySeries?: CreditUsageSeriesPoint[];
}

export interface CreditTransactionRow {
  id: string;
  amount: number;
  balanceAfter?: number | null;
  category?: string | null;
  createdAt?: string | Date | null;
  description?: string | null;
  metadata?: Record<string, unknown> | null;
  organizationId?: string;
  referenceId?: string | null;
  referenceType?: string | null;
  source?: string | null;
}

export interface ListCreditTransactionsParams {
  brandId?: string;
  category?: string;
  limit?: number;
  skip?: number;
  source?: string;
}

export class CreditsService extends HTTPBaseService {
  constructor(token: string) {
    super(`${EnvironmentService.apiEndpoint}/credits`, token);
  }

  static getInstance(token: string): CreditsService {
    return HTTPBaseService.getBaseServiceInstance(
      CreditsService,
      token,
    ) as CreditsService;
  }

  public async getByokUsageSummary(): Promise<ByokUsageSummary> {
    const response = await this.instance.get<JsonApiResponseDocument>(
      '/byok-usage-summary',
    );

    return deserializeResource<ByokUsageSummary>(response.data);
  }

  public async getUsageMetrics(): Promise<CreditUsageMetrics> {
    const response = await this.instance.get<JsonApiResponseDocument>('/usage');

    return deserializeResource<CreditUsageMetrics>(response.data);
  }

  public async listTransactions(
    params: ListCreditTransactionsParams = {},
  ): Promise<CreditTransactionRow[]> {
    const response = await this.instance.get<JsonApiResponseDocument>(
      '/transactions',
      {
        params: {
          ...(params.brandId ? { brandId: params.brandId } : {}),
          ...(params.category ? { category: params.category } : {}),
          ...(params.source ? { source: params.source } : {}),
          ...(typeof params.limit === 'number' ? { limit: params.limit } : {}),
          ...(typeof params.skip === 'number' ? { skip: params.skip } : {}),
        },
      },
    );

    const document = response.data as {
      data?: Array<{
        id?: string;
        attributes?: Omit<CreditTransactionRow, 'id'>;
      }>;
    };

    const rows = document.data ?? [];
    return rows.map((row) => ({
      id: row.id ?? '',
      ...(row.attributes ?? {}),
    })) as CreditTransactionRow[];
  }

  public async getTopbarBalances(): Promise<ITopbarBalances> {
    const response = await this.instance.get<JsonApiResponseDocument>(
      '/topbar-balances',
      { timeout: TOPBAR_BALANCES_TIMEOUT_MS },
    );

    return deserializeResource<ITopbarBalances>(response.data);
  }
}
