import { API_ENDPOINTS } from '@genfeedai/constants';
import type { ISubscriptionPreview } from '@genfeedai/interfaces';
import { Subscription } from '@genfeedai/models/billing/subscription.model';
import {
  SubscriptionPreviewSerializer,
  SubscriptionSerializer,
} from '@genfeedai/serializers';
import {
  BaseService,
  type JsonApiResponseDocument,
} from '@services/core/base.service';

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
    return BaseService.getDataServiceInstance(
      SubscriptionsService,
      token,
    ) as SubscriptionsService;
  }

  public async changeSubscriptionPlan(newPriceId: string): Promise<unknown> {
    const res = await this.instance.patch('current', {
      newPriceId,
    });
    return res.data;
  }

  public async postSubscriptionPreview(body: Partial<ISubscriptionPreview>) {
    const data = SubscriptionPreviewSerializer.serialize(body);

    return await this.instance
      .post<JsonApiResponseDocument>('current/preview', data)
      .then((res) => this.extractResource<ISubscriptionPreview>(res.data));
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
}
