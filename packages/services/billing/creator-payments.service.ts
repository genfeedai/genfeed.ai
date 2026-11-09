import type {
  ICreatorArticleAccess,
  ICreatorEarnings,
  ICreatorSubscriptionOffer,
  ICreatorSubscriptionPlan,
  ICreatorSubscriptionSummary,
  ICreatorTipRequest,
  ICreatorTipResult,
  ICreatorTipTarget,
  ISubscribeToCreatorRequest,
  IUnlockCreatorArticleResult,
  IUpdateCreatorSubscriptionPlanRequest,
} from '@genfeedai/contracts/interfaces/billing';
import { EnvironmentService } from '@services/core/environment.service';
import { HTTPBaseService } from '@services/core/interceptor.service';

/** Readers paying creators in credits (#9714); plain JSON, not JSON:API. */
export class CreatorPaymentsService extends HTTPBaseService {
  constructor(token: string) {
    super(`${EnvironmentService.apiEndpoint}/creator-payments`, token);
  }

  static getInstance(token: string): CreatorPaymentsService {
    return HTTPBaseService.getBaseServiceInstance(
      CreatorPaymentsService,
      token,
    ) as CreatorPaymentsService;
  }

  public async getTipTarget(
    handle: string,
    signal?: AbortSignal,
  ): Promise<ICreatorTipTarget> {
    const response = await this.instance.get<ICreatorTipTarget>(
      `/tips/${encodeURIComponent(handle)}`,
      { signal },
    );
    return response.data;
  }

  public async sendTip(
    request: ICreatorTipRequest,
  ): Promise<ICreatorTipResult> {
    const response = await this.instance.post<ICreatorTipResult>(
      '/tips',
      request,
    );
    return response.data;
  }

  public async getEarnings(signal?: AbortSignal): Promise<ICreatorEarnings> {
    const response = await this.instance.get<ICreatorEarnings>('/earnings', {
      signal,
    });
    return response.data;
  }

  public async getSubscriptionOffer(
    handle: string,
    signal?: AbortSignal,
  ): Promise<ICreatorSubscriptionOffer> {
    const response = await this.instance.get<ICreatorSubscriptionOffer>(
      `/subscriptions/offers/${encodeURIComponent(handle)}`,
      { signal },
    );
    return response.data;
  }

  public async subscribe(
    request: ISubscribeToCreatorRequest,
  ): Promise<ICreatorSubscriptionSummary> {
    const response = await this.instance.post<ICreatorSubscriptionSummary>(
      '/subscriptions',
      request,
    );
    return response.data;
  }

  public async listMySubscriptions(
    signal?: AbortSignal,
  ): Promise<ICreatorSubscriptionSummary[]> {
    const response = await this.instance.get<ICreatorSubscriptionSummary[]>(
      '/subscriptions/mine',
      { signal },
    );
    return response.data;
  }

  public async setCancelAtPeriodEnd(
    subscriptionId: string,
    cancelAtPeriodEnd: boolean,
  ): Promise<ICreatorSubscriptionSummary> {
    const response = await this.instance.patch<ICreatorSubscriptionSummary>(
      `/subscriptions/${encodeURIComponent(subscriptionId)}`,
      { cancelAtPeriodEnd },
    );
    return response.data;
  }

  public async listSubscriptionPlans(
    signal?: AbortSignal,
  ): Promise<ICreatorSubscriptionPlan[]> {
    const response = await this.instance.get<ICreatorSubscriptionPlan[]>(
      '/subscriptions/plans',
      { signal },
    );
    return response.data;
  }

  public async updateSubscriptionPlan(
    brandId: string,
    request: IUpdateCreatorSubscriptionPlanRequest,
  ): Promise<ICreatorSubscriptionPlan> {
    const response = await this.instance.put<ICreatorSubscriptionPlan>(
      `/subscriptions/plans/${encodeURIComponent(brandId)}`,
      request,
    );
    return response.data;
  }

  /** A paid article (#9718): the full body when the reader has access. */
  public async getArticleAccess(
    articleId: string,
    signal?: AbortSignal,
  ): Promise<ICreatorArticleAccess> {
    const response = await this.instance.get<ICreatorArticleAccess>(
      `/articles/${encodeURIComponent(articleId)}`,
      { signal },
    );
    return response.data;
  }

  public async unlockArticle(
    articleId: string,
  ): Promise<IUnlockCreatorArticleResult> {
    const response = await this.instance.post<IUnlockCreatorArticleResult>(
      `/articles/${encodeURIComponent(articleId)}/unlock`,
    );
    return response.data;
  }
}
