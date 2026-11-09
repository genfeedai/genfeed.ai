import { AssetScope } from '@genfeedai/contracts';
import { describe, expect, it } from 'vitest';
import { claimHandleAfterSignup } from '@/lib/onboarding/claim-handle.util';

interface World {
  brands: { id: string; scope?: AssetScope; slug?: string }[];
  organizations: { id: string; isActive?: boolean }[];
  taken: string[];
}

function clientsFor(world: World) {
  return {
    findBrands: async () => world.brands,
    findOrganizations: async () => world.organizations,
    setHandle: async (brandId: string, handle: string) => {
      if (world.taken.includes(handle)) {
        throw new Error('This handle is already taken.');
      }
      const brand = world.brands.find((candidate) => candidate.id === brandId);
      if (brand) {
        brand.slug = handle;
      }
    },
  };
}

describe('claimHandleAfterSignup', () => {
  it('gives the claimed handle to the brand of the active organization', async () => {
    const world: World = {
      brands: [{ id: 'brand-1', slug: 'acme-1234' }],
      organizations: [{ id: 'org-0' }, { id: 'org-1', isActive: true }],
      taken: [],
    };

    await expect(
      claimHandleAfterSignup(clientsFor(world), 'shayla'),
    ).resolves.toBe('claimed');
    expect(world.brands[0]?.slug).toBe('shayla');
  });

  it('keeps the current handle when the claimed one is taken', async () => {
    const world: World = {
      brands: [{ id: 'brand-1', slug: 'acme-1234' }],
      organizations: [{ id: 'org-1' }],
      taken: ['shayla'],
    };

    await expect(
      claimHandleAfterSignup(clientsFor(world), 'shayla'),
    ).resolves.toBe('unavailable');
    expect(world.brands[0]?.slug).toBe('acme-1234');
  });

  it('keeps the handle of a brand whose public profile is already live', async () => {
    const world: World = {
      brands: [{ id: 'brand-1', scope: AssetScope.PUBLIC, slug: 'acme' }],
      organizations: [{ id: 'org-1' }],
      taken: [],
    };

    await expect(
      claimHandleAfterSignup(clientsFor(world), 'shayla'),
    ).resolves.toBe('kept-public');
    expect(world.brands[0]?.slug).toBe('acme');
  });

  it('leaves every handle alone when the organization has several brands', async () => {
    const world: World = {
      brands: [
        { id: 'brand-1', slug: 'acme' },
        { id: 'brand-2', slug: 'acme-studio' },
      ],
      organizations: [{ id: 'org-1' }],
      taken: [],
    };

    await expect(
      claimHandleAfterSignup(clientsFor(world), 'shayla'),
    ).resolves.toBe('several-brands');
    expect(world.brands.map((brand) => brand.slug)).toEqual([
      'acme',
      'acme-studio',
    ]);
  });

  it.each([
    ['the brand already has it', [{ id: 'b', slug: 'shayla' }], 'unchanged'],
    [
      'another of its brands already has it',
      [
        { id: 'a', slug: 'acme' },
        { id: 'b', slug: 'shayla' },
      ],
      'unchanged',
    ],
    ['there is no brand yet', [], 'no-brand'],
  ])('answers when %s', async (_label, brands, outcome) => {
    const world: World = {
      brands,
      organizations: [{ id: 'org-1' }],
      taken: [],
    };

    await expect(
      claimHandleAfterSignup(clientsFor(world), 'shayla'),
    ).resolves.toBe(outcome);
  });
});
