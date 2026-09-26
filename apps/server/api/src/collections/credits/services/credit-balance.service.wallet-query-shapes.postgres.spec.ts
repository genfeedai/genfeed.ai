import { CreditBalanceService } from '@api/collections/credits/services/credit-balance.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { PrismaClient } from '@genfeedai/prisma';
import type { LoggerService } from '@libs/logger/logger.service';
import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, describe, expect, it, vi } from 'vitest';

vi.unmock('@genfeedai/prisma');
vi.unmock('@prisma/adapter-pg');

/**
 * No real database is required here. Prisma validates a query's argument
 * SHAPE against its generated DMMF before it ever opens a connection, so the
 * real generated client, pointed at an address nothing listens on, still
 * proves whether an argument shape is valid: `PrismaClientValidationError`
 * for a malformed one, "Can't reach database server" for a well-formed one
 * that only fails once it tries to connect. That distinguishes exactly the
 * class of bug a mock-only spec cannot catch: independent review found that
 * `findLinkedWallet`'s relation-select args put a `where` on
 * `BillingAccountOrganization.billingAccount`, a *required* to-one relation
 * whose relation-select args have no `where` at all — so every call threw
 * `PrismaClientValidationError` at runtime despite a clean type-check and
 * every mocked spec passing (mocks never run the real argument parser).
 *
 * This file sends each wallet-lookup path's real, unmodified argument object
 * through that real parser — not a re-typed copy — so it can never drift from
 * the implementation the way a duplicated fixture could.
 */
const UNREACHABLE_DATABASE_URL = 'postgresql://user:pass@127.0.0.1:1/genfeed';
const CANT_REACH_DATABASE = /can't reach database server/i;

describe('CreditBalanceService wallet-lookup argument shapes (real Prisma client, no database)', () => {
  const client = new PrismaClient({
    adapter: new PrismaPg({ connectionString: UNREACHABLE_DATABASE_URL }),
  });
  const logger = { error: vi.fn(), warn: vi.fn() } as unknown as LoggerService;
  // The constructor's PrismaService is never used by the paths under test:
  // every wallet-lookup method below takes its Prisma client as an explicit
  // parameter, so the real (if unreachable) `client` is passed directly.
  const service = new CreditBalanceService({} as PrismaService, logger);

  afterAll(async () => {
    await client.$disconnect();
  });

  it('path 1 (own wallet): a well-formed argument shape only fails at the connection, never at validation', async () => {
    await expect(
      service['findOwnWallet']('org_1', { billingAccountId: 'ba_1' }, client),
    ).rejects.toThrow(CANT_REACH_DATABASE);
  });

  it('path 2 (direct attach — Organization.billingAccount is an optional to-one relation, so its relation-select args may carry their own `where`): a well-formed argument shape only fails at the connection', async () => {
    await expect(
      service['findDirectWallet'](
        'org_1',
        { billingAccountId: 'ba_1' },
        client,
      ),
    ).rejects.toThrow(CANT_REACH_DATABASE);
  });

  it('path 3 (linked — BillingAccountOrganization.billingAccount is a required to-one relation, so isDeleted checks are relation filters on the root where, not a nested `where`): a well-formed argument shape only fails at the connection', async () => {
    await expect(
      service['findLinkedWallet'](
        'org_1',
        { billingAccountId: 'ba_1' },
        client,
      ),
    ).rejects.toThrow(CANT_REACH_DATABASE);
  });

  it('path 4 (reservation-authorized — rooted at CreditReservation, a tenant model, rather than a caller-asserted flag; CreditReservation.billingAccount is also a required to-one relation, so no nested `where` on it either): a well-formed argument shape only fails at the connection', async () => {
    await expect(
      service['findReservationAuthorizedWallet'](
        'org_1',
        'res_1',
        { billingAccountId: 'ba_1' },
        client,
      ),
    ).rejects.toThrow(CANT_REACH_DATABASE);
  });

  it('regression: the shape path 3 used before this fix — a `where` nested inside the required `billingAccount` relation-select — fails validation before any connection is attempted', async () => {
    await expect(
      client.billingAccountOrganization.findFirst({
        select: {
          billingAccount: {
            select: {
              creditBalances: { take: 1, where: { isDeleted: false } },
            },
            // Invalid: BillingAccountOrganization.billingAccount is a
            // required to-one relation. Its relation-select args have no
            // `where` — only an optional to-one relation's do.
            where: { isDeleted: false },
          },
        },
        where: {
          billingAccountId: 'ba_1',
          isDeleted: false,
          organizationId: 'org_1',
          status: 'LINKED',
        },
        // Cast needed: TS correctly rejects this shape now that the real
        // Prisma types are in scope — that rejection is the point.
      } as never),
    ).rejects.toThrow(/where/i);
  });

  it("regression: a `where` nested inside CreditReservation.billingAccount's relation-select fails validation before any connection is attempted, same as path 3", async () => {
    await expect(
      client.creditReservation.findFirst({
        select: {
          billingAccount: {
            select: {
              creditBalances: { take: 1, where: { isDeleted: false } },
            },
            // Invalid: CreditReservation.billingAccount is also a required
            // to-one relation. This is exactly the mistake findLinkedWallet
            // made — guarding against repeating it here too.
            where: { isDeleted: false },
          },
        },
        where: {
          billingAccountId: 'ba_1',
          id: 'res_1',
          isDeleted: false,
          organizationId: 'org_1',
        },
        // Cast needed: TS correctly rejects this shape now that the real
        // Prisma types are in scope — that rejection is the point.
      } as never),
    ).rejects.toThrow(/where/i);
  });
});

// findReservationAuthorizedWallet only ever queries `creditReservation
// .findFirst`, scoped to organizationId via `scopedWhere` — never a bare
// `billingAccount.findFirst({ id })`, which is what made the previous
// caller-asserted boolean flag unsafe (no organizationId for a tenant guard
// to check). Behavioral proof that a mismatched reservationId or
// billingAccountId matches no row — rather than another organization's
// wallet — needs an actual query result to distinguish "no match" from
// "unreachable database", so it lives in credit-balance.service.spec.ts
// (mocked) and credit-balance.service.wallet-access.postgres.spec.ts (real
// database), not here.
