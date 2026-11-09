import { installFakeHttpRoutes } from '@services/__mocks__/http-routes.fake';
import { CreatorPaymentsService } from '@services/billing/creator-payments.service';
import { beforeEach, describe, expect, it } from 'vitest';

const echo = (body: unknown) => ({ received: body });

describe('CreatorPaymentsService HTTP methods', () => {
  let service: CreatorPaymentsService;
  let server: ReturnType<typeof installFakeHttpRoutes>;

  beforeEach(() => {
    service = new CreatorPaymentsService('payments-token');
    server = installFakeHttpRoutes(service, {
      'GET /articles/article%2F1': { hasAccess: true, id: 'article/1' },
      'GET /earnings': { balance: 40 },
      'GET /subscriptions/mine': [{ id: 'sub_1' }],
      'GET /subscriptions/offers/jane%20doe': { handle: 'jane doe' },
      'GET /subscriptions/plans': [{ brandId: 'brand_1' }],
      'GET /tips/jane%20doe': { handle: 'jane doe' },
      'PATCH /subscriptions/sub_1': echo,
      'POST /articles/article%2F1/unlock': { unlocked: true },
      'POST /subscriptions': echo,
      'POST /tips': echo,
      'PUT /subscriptions/plans/brand_1': echo,
    });
  });

  it('reads tip targets and subscription offers by encoded handle', async () => {
    await expect(service.getTipTarget('jane doe')).resolves.toEqual({
      handle: 'jane doe',
    });
    await expect(service.getSubscriptionOffer('jane doe')).resolves.toEqual({
      handle: 'jane doe',
    });
  });

  it('sends a tip and a subscription request as the body', async () => {
    const tip = { amount: 5, handle: 'jane' };
    const subscription = { handle: 'jane', planId: 'plan_1' };

    await expect(service.sendTip(tip as never)).resolves.toEqual({
      received: tip,
    });
    await expect(service.subscribe(subscription as never)).resolves.toEqual({
      received: subscription,
    });
    expect(server.bodies['POST /tips']).toEqual([tip]);
  });

  it('lists earnings, my subscriptions and subscription plans', async () => {
    await expect(service.getEarnings()).resolves.toEqual({ balance: 40 });
    await expect(service.listMySubscriptions()).resolves.toEqual([
      { id: 'sub_1' },
    ]);
    await expect(service.listSubscriptionPlans()).resolves.toEqual([
      { brandId: 'brand_1' },
    ]);
  });

  it('toggles cancel at period end on one subscription', async () => {
    await expect(service.setCancelAtPeriodEnd('sub_1', true)).resolves.toEqual({
      received: { cancelAtPeriodEnd: true },
    });
  });

  it('updates the subscription plan of a brand', async () => {
    const request = { priceCredits: 300 };

    await expect(
      service.updateSubscriptionPlan('brand_1', request as never),
    ).resolves.toEqual({ received: request });
  });

  it('reads and unlocks a paid article by encoded id', async () => {
    await expect(service.getArticleAccess('article/1')).resolves.toEqual({
      hasAccess: true,
      id: 'article/1',
    });
    await expect(service.unlockArticle('article/1')).resolves.toEqual({
      unlocked: true,
    });
  });

  it('rejects a request whose signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(service.getEarnings(controller.signal)).rejects.toThrow(
      'canceled',
    );
  });
});
