import type { BillingAccountsService } from '@api/collections/billing-accounts/services/billing-accounts.service';
import type { BrandsService } from '@api/collections/brands/services/brands.service';
import type { CreditBalanceService } from '@api/collections/credits/services/credit-balance.service';
import type { OnboardingCreditGrantsService } from '@api/collections/credits/services/onboarding-credit-grants.service';
import type { MembersService } from '@api/collections/members/services/members.service';
import type { OrganizationSettingsService } from '@api/collections/organization-settings/services/organization-settings.service';
import type { OrganizationsService } from '@api/collections/organizations/services/organizations.service';
import type { RolesService } from '@api/collections/roles/services/roles.service';
import type { SettingsService } from '@api/collections/settings/services/settings.service';
import { UserSetupService } from '@api/collections/users/services/user-setup.service';
import type { CacheService } from '@api/services/cache/cache.service';
import type { LoggerService } from '@libs/logger/logger.service';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

interface Row {
  id: string;
  [key: string]: unknown;
}

/** Lets every other pending caller run before the awaiting one continues. */
const yieldTurn = () => new Promise<void>((resolve) => setImmediate(resolve));

/**
 * In-memory stand-in for the database. Every read and write yields first, so
 * callers interleave between a check and the create that follows it, exactly as
 * concurrent requests do against Postgres.
 */
function buildFakeDatabase(options: { cacheAvailable: boolean }) {
  const organizations: Row[] = [];
  const members: Row[] = [];
  const brands: Row[] = [];
  const settings: Row[] = [];
  const organizationSettings: Row[] = [];
  const creditBalances = new Set<string>();
  const signupGifts = new Set<string>();
  const billingAccounts = new Set<string>();
  const claims = new Map<string, string>();
  let sequence = 0;
  const nextId = (prefix: string) => `${prefix}_${++sequence}`;

  // Real owned-claim semantics: set-if-absent, and only the owner releases.
  const cache = {
    acquireOwnedClaim: async (key: string, token: string) => {
      await yieldTurn();
      if (!options.cacheAvailable) {
        return 'unavailable' as const;
      }
      if (claims.has(key)) {
        return 'duplicate' as const;
      }
      claims.set(key, token);
      return 'claimed' as const;
    },
    releaseOwnedClaim: async (key: string, token: string) => {
      if (claims.get(key) !== token) {
        return false;
      }
      claims.delete(key);
      return true;
    },
  };
  const warn = vi.fn();

  const services = {
    billingAccountsService: {
      ensureForOrganization: async (input: { organizationId: string }) => {
        await yieldTurn();
        billingAccounts.add(input.organizationId);
      },
    },
    brandsService: {
      create: async (data: Row) => {
        await yieldTurn();
        const row = { ...data, id: nextId('brand') };
        brands.push(row);
        return row;
      },
      findOne: async (where: { organizationId: string }) => {
        await yieldTurn();
        return brands.find((b) => b.organizationId === where.organizationId);
      },
      generateUniqueSlug: async (label: string) => {
        await yieldTurn();
        return label.toLowerCase();
      },
    },
    creditBalanceService: {
      getOrCreateBalance: async (organizationId: string) => {
        await yieldTurn();
        creditBalances.add(organizationId);
      },
    },
    membersService: {
      create: async (data: Row) => {
        await yieldTurn();
        const row = { ...data, id: nextId('member') };
        members.push(row);
        return row;
      },
      findOne: async (where: { organizationId: string; userId: string }) => {
        await yieldTurn();
        return members.find(
          (m) =>
            m.organizationId === where.organizationId &&
            m.userId === where.userId,
        );
      },
      findOneSelect: async (where: { userId: string }) => {
        await yieldTurn();
        return members.find((m) => m.userId === where.userId && m.isActive);
      },
      patch: vi.fn(),
    },
    onboardingCreditGrantsService: {
      grantSignupGift: async (organizationId: string) => {
        await yieldTurn();
        signupGifts.add(organizationId);
      },
    },
    organizationSettingsService: {
      ensureForOrganization: async (organizationId: string) => {
        await yieldTurn();
        let row = organizationSettings.find(
          (s) => s.organizationId === organizationId,
        );
        if (!row) {
          row = { id: nextId('orgsettings'), organizationId };
          organizationSettings.push(row);
        }
        return row;
      },
    },
    organizationsService: {
      create: async (data: Row) => {
        await yieldTurn();
        const row = { ...data, id: nextId('org') };
        organizations.push(row);
        return row;
      },
      findOne: async (where: { id?: string; userId?: string }) => {
        await yieldTurn();
        return organizations.find((o) =>
          where.id ? o.id === where.id : o.userId === where.userId,
        );
      },
      findOneSelect: async () => null,
      generateUniqueSlug: async (label: string) => {
        await yieldTurn();
        return label.toLowerCase();
      },
    },
    rolesService: {
      findOne: async () => ({ id: 'role_owner', key: 'owner' }),
    },
    settingsService: {
      create: async (data: Row) => {
        await yieldTurn();
        const row = { ...data, id: nextId('settings') };
        settings.push(row);
        return row;
      },
      findOne: async (where: { userId: string }) => {
        await yieldTurn();
        return settings.find((s) => s.userId === where.userId);
      },
    },
  };

  const buildService = () =>
    new UserSetupService(
      services.organizationsService as unknown as OrganizationsService,
      services.organizationSettingsService as unknown as OrganizationSettingsService,
      services.brandsService as unknown as BrandsService,
      services.membersService as unknown as MembersService,
      services.rolesService as unknown as RolesService,
      services.settingsService as unknown as SettingsService,
      services.billingAccountsService as unknown as BillingAccountsService,
      services.creditBalanceService as unknown as CreditBalanceService,
      services.onboardingCreditGrantsService as unknown as OnboardingCreditGrantsService,
      cache as unknown as CacheService,
      {
        debug: vi.fn(),
        error: vi.fn(),
        log: vi.fn(),
        warn,
      } as unknown as LoggerService,
    );

  return {
    billingAccounts,
    brands,
    claims,
    warn,
    buildService,
    creditBalances,
    members,
    organizationSettings,
    organizations,
    settings,
    signupGifts,
  };
}

describe('UserSetupService concurrent first-run setup', () => {
  const userId = 'user_new';
  const claimKey = `user-setup:${userId}`;

  beforeEach(() => {
    // Only timers are faked: the fake database yields through setImmediate.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // The fake database yields through real setImmediate while the claim wait
  // uses faked timers, so alternate: drain real turns, then advance the clock.
  const settle = async <T>(promises: Promise<T>[]): Promise<T[]> => {
    let done = false;
    const all = Promise.all(promises).finally(() => {
      done = true;
    });
    for (let step = 0; step < 200 && !done; step += 1) {
      await new Promise((resolve) => setImmediate(resolve));
      await vi.advanceTimersByTimeAsync(150);
    }
    return all;
  };

  it('creates exactly one organization and one set of defaults for four concurrent callers', async () => {
    const db = buildFakeDatabase({ cacheAvailable: true });
    const service = db.buildService();

    const results = await settle(
      Array.from({ length: 4 }, () => service.initializeUserResources(userId)),
    );

    expect(db.organizations).toHaveLength(1);
    expect(db.members).toHaveLength(1);
    expect(db.brands).toHaveLength(1);
    expect(db.settings).toHaveLength(1);
    expect(db.organizationSettings).toHaveLength(1);
    expect(db.creditBalances.size).toBe(1);
    expect(db.signupGifts.size).toBe(1);
    expect(db.billingAccounts.size).toBe(1);
    expect(new Set(results.map((r) => r.organization.id))).toEqual(
      new Set([db.organizations[0].id]),
    );
    expect(new Set(results.map((r) => r.member.id))).toEqual(
      new Set([db.members[0].id]),
    );
    expect(db.claims.size).toBe(0);
  });

  it('returns the existing resources without creating anything when another caller finished first', async () => {
    const db = buildFakeDatabase({ cacheAvailable: true });
    const service = db.buildService();

    const [first] = await settle([service.initializeUserResources(userId)]);
    const [second] = await settle([service.initializeUserResources(userId)]);

    expect(second.organization.id).toBe(first.organization.id);
    expect(second.brand.id).toBe(first.brand.id);
    expect(second.member.id).toBe(first.member.id);
    expect(second.userSettings.id).toBe(first.userSettings.id);
    expect(db.organizations).toHaveLength(1);
    expect(db.members).toHaveLength(1);
    expect(db.brands).toHaveLength(1);
    expect(db.settings).toHaveLength(1);
  });

  it('does not serialise setup for different users', async () => {
    const db = buildFakeDatabase({ cacheAvailable: true });
    const service = db.buildService();

    await settle([
      service.initializeUserResources('user_a'),
      service.initializeUserResources('user_b'),
    ]);

    expect(db.organizations).toHaveLength(2);
    expect(db.members).toHaveLength(2);
  });

  it('still completes setup when the cache is unavailable', async () => {
    const db = buildFakeDatabase({ cacheAvailable: false });
    const service = db.buildService();

    const [result] = await settle([service.initializeUserResources(userId)]);

    expect(result.organization.id).toBe(db.organizations[0].id);
    expect(db.organizations).toHaveLength(1);
    expect(db.members).toHaveLength(1);
  });

  it('completes without duplicates when the wait is exhausted after the holder finished', async () => {
    const db = buildFakeDatabase({ cacheAvailable: true });
    const service = db.buildService();
    const [first] = await settle([service.initializeUserResources(userId)]);
    // The holder finished but its claim is still standing (lost release).
    db.claims.set(claimKey, 'finished-holder');

    const [second] = await settle([service.initializeUserResources(userId)]);

    expect(second.organization.id).toBe(first.organization.id);
    expect(second.member.id).toBe(first.member.id);
    expect(db.organizations).toHaveLength(1);
    expect(db.members).toHaveLength(1);
    expect(db.brands).toHaveLength(1);
    expect(db.claims.get(claimKey)).toBe('finished-holder');
    expect(db.warn).toHaveBeenCalledWith(
      expect.stringContaining('Timed out waiting for the user setup claim'),
      'UserSetupService',
    );
  });
});
