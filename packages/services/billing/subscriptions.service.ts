import { API_ENDPOINTS } from '@genfeedai/contracts/constants';
import type {
  ISubscriptionPreview,
  OrganizationCreditUsageResponse,
  SubscriptionChangePreview,
} from '@genfeedai/contracts/interfaces';
import type { IHttpRequestOptions } from '@genfeedai/contracts/interfaces/utils/http-request-options.interface';
import { Subscription } from '@genfeedai/models/billing/subscription.model';
import { PagesService } from '@services/content/pages.service';
import { BaseService } from '@services/core/base.service';
import type { AxiosRequestConfig } from 'axios';

export class SubscriptionsService extends BaseService<Subscription> {
  constructor(token: string) {
    super(API_ENDPOINTS.SUBSCRIPTIONS, token, Subscription);
  }

  public static getInstance(token: string): SubscriptionsService {
    return BaseService.getDataServiceInstance(SubscriptionsService, token);
  }

  public async changeSubscriptionPlan(newPriceId: string): Promise<unknown> {
    const res = await this.instance.patch('current', {
      newPriceId,
    });
    return res.data;
  }

  /**
   * The subscriptions controller takes a plain `{ price }` body and answers
   * `{ success, message, data }` — not JSON:API — so this mirrors
   * `getCreditsBreakdown` rather than the serializer round-trip.
   */
  public async previewSubscriptionChange(
    newPriceId: string,
  ): Promise<SubscriptionChangePreview> {
    const res = await this.instance.post('current/preview', {
      price: newPriceId,
    } satisfies ISubscriptionPreview);

    return res.data.data as SubscriptionChangePreview;
  }

  public async getCreditsBreakdown(): Promise<{
    total: number;
    planLimit: number;
    cycleTotal?: number;
    remainingPercent?: number;
    cycleStartAt?: string;
    cycleEndAt?: string;
    credits: Array<{
      balance: number;
      expiresAt?: string;
      source?: string;
      createdAt?: string;
    }>;
  }> {
    const config: AxiosRequestConfig & IHttpRequestOptions = {
      handledErrorStatuses: [500, 502, 503, 504],
    };
    const res = await this.instance.get('current/credits', config);
    return res.data.data;
  }

  public async getCreditUsage(
    query?: { limit?: number; page?: number },
    signal?: AbortSignal,
  ): Promise<OrganizationCreditUsageResponse> {
    const res = await this.instance.get<OrganizationCreditUsageResponse>(
      'admin/credit-usage',
      { params: query, signal },
    );
    // Feeds AutoPagination, which reads the totals from PagesService.
    if (query?.page) {
      PagesService.setCurrentPage(res.data.page);
      PagesService.setTotalPages(res.data.totalPages);
      PagesService.setTotalDocs(res.data.totalDocs);
    }
    return res.data;
  }
}
