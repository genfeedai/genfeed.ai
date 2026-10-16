import { BOOKING_HREF } from '@data/booking.data';
import * as PageModule from '@public/pricing/page';
import { runPageModuleTests } from '@shared/pages/pageTestUtils';
import type { ResolvingMetadata } from 'next';
import { describe, expect, it } from 'vitest';

runPageModuleTests('apps/website/app/(public)/pricing/page', PageModule);

describe('pricing metadata', () => {
  it('names Agencies and the Done for you price', async () => {
    const parent = Promise.resolve({}) as ResolvingMetadata;

    const result = await PageModule.generateMetadata({}, parent);

    expect(result.description).toContain('Agencies with unlimited seats');
    expect(result.description).toContain('Done for you from $2,500/month');
    expect(result.description).not.toContain('Pro');
  });

  it('keeps the meta description inside the search-snippet budget', async () => {
    const parent = Promise.resolve({}) as ResolvingMetadata;

    const result = await PageModule.generateMetadata({}, parent);

    // Ahrefs flags anything over 158 characters as "Meta description too long".
    expect(result.description?.length).toBeGreaterThanOrEqual(100);
    expect(result.description?.length).toBeLessThanOrEqual(158);
  });

  it('keeps the JSON-LD entitlement copy aligned with pricing metadata', () => {
    const jsonLd = PageModule.buildPricingJsonLd();

    expect(jsonLd.description).toContain(
      'Agencies ($499/month) adds unlimited seats, client workspaces',
    );
    expect(jsonLd.description).toContain('Done for you is from $2,500/month');
  });
  it('describes PAYG per credit and the managed retainer as a separate service', () => {
    const jsonLd = PageModule.buildPricingJsonLd();
    const payg = jsonLd.mainEntity.offers.find(
      (offer) => offer.name === 'Pay As You Go',
    );
    expect(payg?.price).toBe('0.01');
    expect(payg?.priceSpecification).toMatchObject({
      unitText: 'credit',
      price: 0.01,
    });
    expect(
      jsonLd.mainEntity.offers.find((offer) => offer.name === 'Pro'),
    ).toBeUndefined();
    expect(jsonLd.about).toMatchObject({
      '@type': 'Service',
      name: 'Done for you',
      offers: {
        url: BOOKING_HREF,
        priceSpecification: {
          minPrice: 2500,
          billingDuration: 'P1M',
          priceCurrency: 'USD',
        },
      },
    });
  });
});
