import type { CreditBalanceDocument } from '@api/collections/credits/schemas/credit-balance.schema';
import { BusinessLogicException } from '@api/exceptions/business-logic.exception';
import { HandleErrors } from '@api/helpers/decorators/error-handler.decorator';
import type { PrismaTransactionClient } from '@api/helpers/utils/transaction/transaction.util';
import { scopedWhere } from '@api/index';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BillingAccountOrganizationStatus } from '@genfeedai/contracts';
import type {
  IApplyCreditDeltaInput,
  ICreditWalletSnapshot,
} from '@genfeedai/contracts/interfaces/billing';
import { Prisma, type PrismaClient } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

type WalletLookupFilter = { billingAccountId?: string; id?: string };

/**
 * The minimal Prisma delegate surface the four wallet-lookup path methods
 * below actually call — nothing more. `PrismaService` and
 * `PrismaTransactionClient` both satisfy this structurally (they carry these
 * delegates unchanged from the generated `PrismaClient` they extend/omit
 * from), so every production call site is unaffected. Narrowing the
 * parameter to this shape — rather than `PrismaService | PrismaTransactionClient`,
 * which additionally requires the NestJS lifecycle hooks
 * `onModuleInit`/`onModuleDestroy` that only `PrismaService` declares — is
 * also what lets a test construct a real, bare generated `PrismaClient` (no
 * Nest wiring, no lifecycle hooks) and pass it in directly, so the argument
 * shapes below can be validated against the real Prisma client rather than a
 * mock — without an `as never`/`as any` cast to paper over the mismatch.
 */
type WalletLookupClient = Pick<
  PrismaClient,
  | 'billingAccountOrganization'
  | 'creditBalance'
  | 'creditReservation'
  | 'organization'
>;

/**
 * The nested `CreditBalance[]` read shared by every relation-based wallet
 * lookup path (`findDirectWallet`, `findLinkedWallet`,
 * `findReservationAuthorizedWallet`): the caller's filter, not deleted, the
 * oldest match first so a billing account with more than one live wallet
 * resolves deterministically instead of picking whichever row Postgres
 * happens to return first.
 */
function creditBalanceLookup(filter: WalletLookupFilter): {
  orderBy: Prisma.CreditBalanceOrderByWithRelationInput;
  take: number;
  where: Prisma.CreditBalanceWhereInput;
} {
  return {
    orderBy: { createdAt: 'asc' },
    take: 1,
    where: { ...filter, isDeleted: false },
  };
}

@Injectable()
export class CreditBalanceService {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
  ) {}

  @HandleErrors('create credit balance', 'credits')
  async create(
    data: {
      balance: number;
      isDeleted: boolean;
      organizationId: string;
      billingAccountId?: string | null;
      heldAmount?: number;
      version?: number;
    },
    tx?: PrismaTransactionClient,
  ): Promise<CreditBalanceDocument> {
    return (tx ?? this.prisma).creditBalance.create({ data });
  }

  @HandleErrors('find by organization', 'credits')
  async findByOrganization(
    organizationId: string,
    tx?: PrismaTransactionClient,
  ): Promise<CreditBalanceDocument | null> {
    if (!organizationId) {
      this.logger.warn(`${this.constructorName} findByOrganization failed`, {
        organizationId,
      });
      return null;
    }

    return (tx ?? this.prisma).creditBalance.findFirst({
      where: scopedWhere(organizationId, {}),
    });
  }

  @HandleErrors('get or create balance', 'credits')
  async getOrCreateBalance(
    organizationId: string,
    tx?: PrismaTransactionClient,
    billingAccountId?: string | null,
    reservationId?: string,
  ): Promise<CreditBalanceDocument> {
    if (!organizationId) {
      throw new Error(`Invalid organization ID: ${organizationId}`);
    }

    const client = tx ?? this.prisma;
    if (billingAccountId) {
      const shared = await this.findAccessibleWallet(
        organizationId,
        { billingAccountId },
        client,
        reservationId,
      );
      if (shared) {
        return shared;
      }
    }

    const balance = await this.findByOrganization(organizationId, tx);

    if (!balance) {
      return this.create(
        {
          balance: 0,
          billingAccountId: billingAccountId ?? undefined,
          heldAmount: 0,
          isDeleted: false,
          organizationId,
          version: 0,
        },
        tx,
      );
    }

    if (billingAccountId && !balance.billingAccountId) {
      return client.creditBalance.update({
        data: { billingAccountId },
        where: scopedWhere(organizationId, { id: balance.id }),
      });
    }

    return balance;
  }

  /**
   * A shared BillingAccount wallet may be owned by another organization, or by
   * none, so it cannot be filtered by the requesting organizationId alone. The
   * requesting organization may use a wallet it owns, or one whose billing
   * account it is actively attached to (direct `Organization.billingAccountId`
   * or a LINKED, non-deleted `BillingAccountOrganization` row — the same two
   * paths `BillingAccountsService.resolveForOrganization` accepts) — or, when
   * a `reservationId` is given, one it transacted against through an
   * independently tenant-scoped `CreditReservation` row, even if the org has
   * since detached from that billing account.
   *
   * Each path is proven with its own tenant-scoped query rather than an `OR`
   * folded into the `CreditBalance` lookup itself: `organizationId` on
   * `CreditBalance` may be null or another org's, so it can never be the
   * thing that proves access. Instead every branch starts from a row that is
   * already known to belong to `organizationId` — the org's own row, a
   * LINKED `BillingAccountOrganization` row, or a specific `CreditReservation`
   * row, all scoped with `scopedWhere` — and reads the wallet through the
   * Prisma relation from there, so the join itself (not an `OR`, and not a
   * caller-asserted flag) is what proves the wallet is reachable.
   *
   * Split into one method per path (rather than inlined here) so each path's
   * exact Prisma argument object can be exercised in isolation against a real
   * (even unreachable) Prisma client in tests — Prisma validates argument
   * shape before it ever opens a connection, so that catches an invalid shape
   * a mock can't: `Organization.billingAccount` is an optional to-one
   * relation, so its relation-select args accept a `where`.
   * `BillingAccountOrganization.billingAccount` and
   * `CreditReservation.billingAccount` are both *required* to-one relations —
   * their relation-select args have no `where` at all, so any extra filtering
   * on them is done as relation filters on the root `where` instead (see
   * `findLinkedWallet`).
   */
  private async findAccessibleWallet(
    organizationId: string,
    filter: WalletLookupFilter,
    client: WalletLookupClient,
    reservationId?: string,
  ): Promise<CreditBalanceDocument | null> {
    const own = await this.findOwnWallet(organizationId, filter, client);
    if (own) {
      return own;
    }

    const direct = await this.findDirectWallet(organizationId, filter, client);
    if (direct) {
      return direct;
    }

    const linked = await this.findLinkedWallet(organizationId, filter, client);
    if (linked) {
      return linked;
    }

    if (!reservationId || !filter.billingAccountId) {
      return null;
    }

    return this.findReservationAuthorizedWallet(
      organizationId,
      reservationId,
      filter,
      client,
    );
  }

  /** Path 1: a wallet the requesting organization owns outright. */
  private async findOwnWallet(
    organizationId: string,
    filter: WalletLookupFilter,
    client: WalletLookupClient,
  ): Promise<CreditBalanceDocument | null> {
    return client.creditBalance.findFirst({
      where: scopedWhere(organizationId, { ...filter }),
    });
  }

  /**
   * Path 2: a wallet on the BillingAccount the organization is directly
   * attached to via `Organization.billingAccountId` — an optional to-one
   * relation, so its relation-select args may carry their own `where`.
   */
  private async findDirectWallet(
    organizationId: string,
    filter: WalletLookupFilter,
    client: WalletLookupClient,
  ): Promise<CreditBalanceDocument | null> {
    const direct = await client.organization.findFirst({
      select: {
        billingAccount: {
          select: {
            creditBalances: creditBalanceLookup(filter),
          },
          where: { isDeleted: false },
        },
      },
      where: { id: organizationId, isDeleted: false },
    });

    return direct?.billingAccount?.creditBalances[0] ?? null;
  }

  /**
   * Path 3: a wallet on the BillingAccount a LINKED, non-deleted
   * `BillingAccountOrganization` row attaches the organization to.
   * `BillingAccountOrganization.billingAccount` is a *required* to-one
   * relation, so — unlike `findDirectWallet` above — its relation-select args
   * have no `where` of their own; the generated Prisma client rejects one
   * with `PrismaClientValidationError` before ever opening a connection. The
   * `isDeleted` checks on the billing account and the organization are
   * instead relation filters on this query's own root `where`.
   */
  private async findLinkedWallet(
    organizationId: string,
    filter: WalletLookupFilter,
    client: WalletLookupClient,
  ): Promise<CreditBalanceDocument | null> {
    const linked = await client.billingAccountOrganization.findFirst({
      select: {
        billingAccount: {
          select: {
            creditBalances: creditBalanceLookup(filter),
          },
        },
      },
      where: scopedWhere(organizationId, {
        billingAccount: { isDeleted: false },
        organization: { isDeleted: false },
        status: BillingAccountOrganizationStatus.LINKED,
        ...(filter.billingAccountId
          ? { billingAccountId: filter.billingAccountId }
          : {}),
      }),
    });

    return linked?.billingAccount?.creditBalances[0] ?? null;
  }

  /**
   * Path 4: a wallet on the BillingAccount a specific `CreditReservation`
   * held credits against, even if the organization has since detached from
   * that billing account. Unlike the other paths, access here cannot come
   * from a caller-asserted flag — a boolean on the public
   * `IApplyCreditDeltaInput` contract would let any future caller pass `true`
   * with an arbitrary `billingAccountId` and reach another organization's
   * wallet, unseen by either tenant guard (a bare `billingAccount.findFirst`
   * has no `organizationId` to check). Instead this query is *itself* rooted
   * at `CreditReservation`, a tenant-scoped model the static checker and the
   * runtime guard both see: `scopedWhere` requires the reservation to belong
   * to `organizationId`, and requires it to be the exact row identified by
   * `reservationId`, holding credits on exactly `filter.billingAccountId`. A
   * mismatched `reservationId` or `billingAccountId` matches no row and
   * returns `null` — there is no query shape here that can reach a wallet the
   * caller has not already proven this reservation belongs to.
   */
  private async findReservationAuthorizedWallet(
    organizationId: string,
    reservationId: string,
    filter: WalletLookupFilter,
    client: WalletLookupClient,
  ): Promise<CreditBalanceDocument | null> {
    if (!filter.billingAccountId) {
      return null;
    }

    const reservation = await client.creditReservation.findFirst({
      select: {
        billingAccount: {
          select: { creditBalances: creditBalanceLookup(filter) },
        },
      },
      where: scopedWhere(organizationId, {
        billingAccountId: filter.billingAccountId,
        id: reservationId,
      }),
    });

    return reservation?.billingAccount?.creditBalances[0] ?? null;
  }

  toSnapshot(balance: CreditBalanceDocument): ICreditWalletSnapshot {
    const settled = typeof balance.balance === 'number' ? balance.balance : 0;
    const held =
      typeof balance.heldAmount === 'number' ? balance.heldAmount : 0;
    return {
      available: settled - held,
      billingAccountId: balance.billingAccountId ?? null,
      held,
      id: balance.id,
      organizationId: balance.organizationId ?? '',
      settled,
      version: balance.version ?? 0,
    };
  }

  /**
   * Conditional balance mutation. Rejects the write when it would make
   * available credits (settled - held) drop below `-maxOverdraftCredits`,
   * or when it would make held amount negative.
   */
  async applyDelta(
    organizationId: string,
    input: IApplyCreditDeltaInput,
    tx?: PrismaTransactionClient,
    reservationId?: string,
  ): Promise<ICreditWalletSnapshot> {
    const balanceDelta = input.balanceDelta ?? 0;
    const heldDelta = input.heldDelta ?? 0;
    const maxOverdraftCredits = Math.max(0, input.maxOverdraftCredits ?? 0);
    const balance = await this.getOrCreateBalance(
      organizationId,
      tx,
      input.billingAccountId,
      reservationId,
    );
    const client = tx ?? this.prisma;
    const updated = await client.$executeRaw(
      Prisma.sql`
        UPDATE "credit_balances"
        SET
          "balance" = "balance" + ${balanceDelta},
          "heldAmount" = "heldAmount" + ${heldDelta},
          "version" = "version" + 1,
          "updatedAt" = CURRENT_TIMESTAMP
        WHERE "id" = ${balance.id}
          AND "organizationId" IS NOT DISTINCT FROM ${balance.organizationId}
          AND "isDeleted" = false
          AND "heldAmount" + ${heldDelta} >= 0
          AND ("balance" + ${balanceDelta}) - ("heldAmount" + ${heldDelta}) >= ${-maxOverdraftCredits}
      `,
    );

    if (updated !== 1) {
      throw new BusinessLogicException(
        `Insufficient organization credits. Available: ${this.toSnapshot(balance).available}, Required: ${Math.max(0, -balanceDelta) + Math.max(0, heldDelta)}, Max overdraft: ${maxOverdraftCredits}`,
        {
          available: this.toSnapshot(balance).available,
          balanceDelta,
          heldDelta,
          maxOverdraftCredits,
          organizationId,
        },
        'INSUFFICIENT_CREDITS',
      );
    }

    const next = await this.findAccessibleWallet(
      organizationId,
      {
        billingAccountId: balance.billingAccountId ?? undefined,
        id: balance.id,
      },
      client,
      reservationId,
    );
    if (!next) {
      throw new BusinessLogicException(
        'Credit balance disappeared during mutation',
      );
    }

    return this.toSnapshot(next);
  }

  @HandleErrors('update balance', 'credits')
  async updateBalance(
    organizationId: string,
    newBalance: number,
    billingAccountId: string,
    tx?: PrismaTransactionClient,
  ): Promise<CreditBalanceDocument> {
    const current = await this.getOrCreateBalance(
      organizationId,
      tx,
      billingAccountId,
    );
    const snapshot = await this.applyDelta(
      organizationId,
      {
        balanceDelta: newBalance - (current.balance ?? 0),
        billingAccountId,
      },
      tx,
    );
    const next = await this.findAccessibleWallet(
      organizationId,
      { billingAccountId, id: snapshot.id },
      tx ?? this.prisma,
    );
    if (!next) {
      throw new BusinessLogicException(
        'Credit balance disappeared during mutation',
      );
    }
    return next;
  }

  @HandleErrors('delete credit balance', 'credits')
  async delete(id: string): Promise<void> {
    await this.prisma.creditBalance.update({
      data: { isDeleted: true },
      where: { id },
    });
  }
}
