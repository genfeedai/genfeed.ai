import { PublicNewsletterSubscribeController } from '@api/collections/newsletter-subscribers/controllers/public-newsletter-subscribe.controller';
import type { BrandSubscribersService } from '@api/collections/newsletter-subscribers/services/brand-subscribers.service';
import type { Request } from 'express';
import { describe, expect, it } from 'vitest';

/** A one-token subscriber store: confirming activates it once. */
function createStore() {
  const state = { status: 'pending' as 'pending' | 'active' };
  const service = {
    confirm: async (token: string) => {
      if (token !== 'good-token' || state.status !== 'pending') return null;
      state.status = 'active';
      return { brandLabel: 'Acme Weekly' };
    },
  } as unknown as BrandSubscribersService;
  return {
    controller: new PublicNewsletterSubscribeController(service),
    state,
  };
}

describe('PublicNewsletterSubscribeController confirm', () => {
  it('opening the emailed link only shows a confirm button', () => {
    const { controller, state } = createStore();

    const html = controller.confirmPage({
      originalUrl: '/v1/public/newsletter/confirm/good-token',
    } as Request);

    expect(html).toContain(
      '<form method="post" action="/v1/public/newsletter/confirm/good-token">',
    );
    expect(html).toContain('Confirm subscription');
    expect(state.status).toBe('pending');
  });

  it('submitting the form subscribes the reader once', async () => {
    const { controller, state } = createStore();

    const first = await controller.confirm('good-token');
    const second = await controller.confirm('good-token');

    expect(first).toContain('You will now receive Acme Weekly by email.');
    expect(state.status).toBe('active');
    expect(second).toContain('Link not valid');
  });
});
