import { BOOKING_HREF } from '@data/booking.data';
import * as PageModule from '@public/pricing/page';
import { runPageModuleTests } from '@shared/pages/pageTestUtils';
import type { ResolvingMetadata } from 'next';
import { describe, expect, it } from 'vitest';

runPageModuleTests('apps/marketing/app/(public)/pricing/page', PageModule);

describe('pricing metadata', () => {
  it('names Pro, Scale and the Enterprise price', async () => {
    const parent = Promise.resolve({}) as ResolvingMetadata;

    const result = await PageModule.generateMetadata({}, parent);

    expect(result.description).toContain('Pro ($49/month)');
    expect(result.description).toContain('Scale ($499/month)');
    expect(result.description).toContain('Enterprise from $2,500/month');
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
      'Pro ($49/month) adds every app and monthly credits',
    );
    expect(jsonLd.description).toContain(
      'Scale ($499/month) adds unlimited seats and client workspaces',
    );
    expect(jsonLd.description).toContain('Enterprise is from $2,500/month');
  });
  it('lists PAYG as free and Pro as a monthly offer, with the managed retainer as a separate service', () => {
    const jsonLd = PageModule.buildPricingJsonLd();
    const payg = jsonLd.mainEntity.offers.find(
      (offer) => offer.name === 'Pay As You Go',
    );
    expect(payg?.price).toBe('0');
    expect(payg?.priceSpecification).toBeUndefined();
    const pro = jsonLd.mainEntity.offers.find((offer) => offer.name === 'Pro');
    expect(pro?.price).toBe('49');
    expect(pro?.priceSpecification).toMatchObject({ billingDuration: 'P1M' });
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
