import { describe, expect, it } from 'vitest';
import { selectSoftwareSubscriptionItem } from './stripe-software-item.util';

describe('software subscription identity', () => {
  const software = {
    id: 'si_software',
    price: { id: 'price_scale', metadata: {} },
  };
  const service = {
    id: 'si_service',
    price: { id: 'price_content', metadata: {} },
  };
  it.each([
    [service, software],
    [software, service],
  ])('finds software independently of product order', (...items) => {
    expect(
      selectSoftwareSubscriptionItem({ items: { data: items } }, [
        'price_scale',
      ]),
    ).toBe(software);
  });
  it('ignores a separate service subscription', () => {
    expect(
      selectSoftwareSubscriptionItem(
        { metadata: { billing_scope: 'service' }, items: { data: [service] } },
        ['price_scale'],
      ),
    ).toBeNull();
  });
  it('accepts explicitly provisioned negotiated software without comparing prices', () => {
    const custom = {
      price: {
        id: 'price_custom',
        metadata: {
          genfeed_software_tier: 'scale',
          included_monthly_credits: '60000',
        },
      },
    };
    expect(
      selectSoftwareSubscriptionItem({ items: { data: [service, custom] } }, [
        'price_scale',
      ]),
    ).toBe(custom);
  });
  it('preserves Scale when a service line is canceled and never promotes the remaining service to software', () => {
    expect(
      selectSoftwareSubscriptionItem(
        {
          metadata: { billing_scope: 'software' },
          items: { data: [software] },
        },
        ['price_scale'],
      ),
    ).toBe(software);
    expect(() =>
      selectSoftwareSubscriptionItem(
        { metadata: { billing_scope: 'software' }, items: { data: [service] } },
        ['price_scale'],
      ),
    ).toThrow('missing');
  });
  it('rejects duplicate software entitlements', () => {
    expect(() =>
      selectSoftwareSubscriptionItem(
        { items: { data: [software, software] } },
        ['price_scale'],
      ),
    ).toThrow('ambiguous');
  });
  it('refuses to guess among unrelated products or partial pages', () => {
    expect(() =>
      selectSoftwareSubscriptionItem({ items: { data: [service, service] } }, [
        'price_scale',
      ]),
    ).toThrow('missing');
    expect(() =>
      selectSoftwareSubscriptionItem(
        { items: { data: [software], has_more: true } },
        ['price_scale'],
      ),
    ).toThrow('Incomplete');
  });
});
