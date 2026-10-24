import { SubscriptionStatus } from '@genfeedai/contracts';
import type {
  CreateCheckoutSessionDto,
  IAuthPublicData,
  IBillingPortalResponse,
  ICheckoutSessionResponse,
} from '@genfeedai/contracts/interfaces';
import type {
  ITrialClaimResponse,
  ITrialClaimStatusResponse,
} from '@genfeedai/contracts/interfaces/billing';
import { EnvironmentService } from '@services/core/environment.service';
import { HTTPBaseService } from '@services/core/interceptor.service';
import {
  deserializeResource,
  type JsonApiResponseDocument,
} from '@services/core/json-api';
import { serializeRequest } from '@services/core/request-serializers';

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
    const body = await serializeRequest('StripeCheckoutSerializer', data);

    return await this.instance
      .post<JsonApiResponseDocument>('/checkout', body)
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
   * Whether the signed-in user can still unlock the free-trial credits by
   * saving a card.
   */
  public async getTrialCardStatus(
    signal?: AbortSignal,
  ): Promise<ITrialClaimStatusResponse> {
    return await this.instance
      .get<ITrialClaimStatusResponse>('/trial-card/status', { signal })
      .then((res) => res.data);
  }

  /**
   * Start Stripe Checkout in setup mode to save a card (no charge). Stripe
   * returns the user to `returnPath` with `trialCard=success&session_id=`.
   */
  public async createTrialCardCheckout(
    returnPath: string,
  ): Promise<ICheckoutSessionResponse> {
    return await this.instance
      .post<JsonApiResponseDocument>('/trial-card/checkout', { returnPath })
      .then((res) => deserializeResource<ICheckoutSessionResponse>(res.data));
  }

  /**
   * Claim the trial credits with the card saved by a finished setup session.
   */
  public async claimTrialCard(
    sessionId: string,
    signal?: AbortSignal,
  ): Promise<ITrialClaimResponse> {
    return await this.instance
      .post<ITrialClaimResponse>('/trial-card/claim', { sessionId }, { signal })
      .then((res) => res.data);
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
