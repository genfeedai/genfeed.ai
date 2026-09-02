import { SubscriptionStatus } from '@genfeedai/contracts';
import type {
  CreateCheckoutSessionDto,
  IAuthPublicData,
  IBillingPortalResponse,
  ICheckoutSessionResponse,
} from '@genfeedai/contracts/interfaces';
import { StripeCheckoutSerializer } from '@genfeedai/serializers';
import { EnvironmentService } from '@services/core/environment.service';
import { HTTPBaseService } from '@services/core/interceptor.service';
import {
  deserializeResource,
  type JsonApiResponseDocument,
} from '@services/core/json-api';

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
   * Get Stripe billing portal URL for organization.
   *
   * `returnPath` is the app-relative path Stripe returns the customer to
   * (e.g. `/acme/~/settings/organization/subscription`). The server can't
   * derive it — the org slug only exists client-side — and rejects anything
   * that isn't origin-relative.
   */
  public async getPortalUrl(
    returnPath?: string,
  ): Promise<IBillingPortalResponse> {
    return await this.instance
      .get<JsonApiResponseDocument>('/portal', {
        params: returnPath ? { returnPath } : undefined,
      })
      .then((res) => deserializeResource<IBillingPortalResponse>(res.data));
  }

  /**
   * Check if organization has an active subscription from auth metadata.
   */
  public static isSubscriptionActive(authPublicData: IAuthPublicData): boolean {
    return (
      authPublicData?.stripeSubscriptionStatus === SubscriptionStatus.ACTIVE
    );
  }
}
