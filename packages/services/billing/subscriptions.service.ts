import { API_ENDPOINTS } from '@genfeedai/contracts/constants';
import type {
  ISubscriptionPreview,
  OrganizationCreditUsageResponse,
  SubscriptionChangePreview,
} from '@genfeedai/contracts/interfaces';
import { Subscription } from '@genfeedai/models/billing/subscription.model';
import { SubscriptionSerializer } from '@genfeedai/serializers';
import { BaseService } from '@services/core/base.service';

export class SubscriptionsService extends BaseService<Subscription> {
  constructor(token: string) {
    super(
      API_ENDPOINTS.SUBSCRIPTIONS,
      token,
      Subscription,
      SubscriptionSerializer,
    );
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
    const res = await this.instance.get('current/credits');
    return res.data.data;
  }

  public async getCreditUsage(): Promise<OrganizationCreditUsageResponse> {
    const res = await this.instance.get('admin/credit-usage');
    return res.data;
  }
}
