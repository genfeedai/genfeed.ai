import { StripeCheckoutSerializer } from '@genfeedai/client/serializers';
import { SubscriptionStatus } from '@genfeedai/enums';
import type {
  CreateCheckoutSessionDto,
  IBillingPortalResponse,
  ICheckoutSessionResponse,
  IClerkPublicData,
} from '@genfeedai/interfaces';
import {
  deserializeResource,
  type JsonApiResponseDocument,
} from '@helpers/data/json-api/json-api.helper';
import { EnvironmentService } from '@services/core/environment.service';
import { HTTPBaseService } from '@services/core/interceptor.service';

export class StripeService extends HTTPBaseService {
  constructor(token: string) {
    super(`${EnvironmentService.apiEndpoint}/services/stripe`, token);
  }

  public static getInstance(token: string): StripeService {
    return HTTPBaseService.getBaseServiceInstance(
      StripeService,
      token,
    ) as StripeService;
  }

  /**
   * Create a checkout session for subscription
   */
  public async createCheckoutSession(
    data: CreateCheckoutSessionDto,
  ): Promise<ICheckoutSessionResponse> {
    const body = StripeCheckoutSerializer.serialize(data);

    return await this.instance
      .post<JsonApiResponseDocument>('/checkout', body)
      .then((res) => deserializeResource<ICheckoutSessionResponse>(res.data));
  }

  /**
   * Create a Stripe Checkout session in setup mode to save a payment method.
   * Returns a URL to redirect the user to Stripe's hosted page.
   */
  public async createSetupCheckout(): Promise<ICheckoutSessionResponse> {
    return await this.instance
      .post<JsonApiResponseDocument>('/setup-intent')
      .then((res) => deserializeResource<ICheckoutSessionResponse>(res.data));
  }

  /**
   * Get Stripe billing portal URL for organization
   */
  public async getPortalUrl(): Promise<IBillingPortalResponse> {
    return await this.instance
      .get<JsonApiResponseDocument>('/portal')
      .then((res) => deserializeResource<IBillingPortalResponse>(res.data));
  }

  /**
   * Check if organization has active subscription from Clerk data
   */
  public static isSubscriptionActive(
    clerkPublicData: IClerkPublicData,
  ): boolean {
    return (
      clerkPublicData?.stripeSubscriptionStatus === SubscriptionStatus.ACTIVE
    );
  }
}
