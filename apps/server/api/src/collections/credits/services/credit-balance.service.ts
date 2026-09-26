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
import { Prisma } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

type WalletLookupFilter = { billingAccountId?: string; id?: string };

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
    isBillingAccountPreauthorized = false,
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
        isBillingAccountPreauthorized,
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
   * `isBillingAccountPreauthorized` is set, one an independently tenant-scoped
   * row (a `CreditReservation`) already proved this org held credits against,
   * even if the org has since detached from it.
   *
   * Each path is proven with its own tenant-scoped query rather than an `OR`
   * folded into the `CreditBalance` lookup itself: `organizationId` on
   * `CreditBalance` may be null or another org's, so it can never be the
   * thing that proves access. Instead every branch starts from a row that is
   * already known to belong to `organizationId` — the org's own row, or a
   * LINKED `BillingAccountOrganization` row scoped with `scopedWhere` — and
   * reads the wallet through the Prisma relation from there, so the join
   * itself (not an `OR`) is what proves the wallet is reachable.
   *
   * Split into one method per path (rather than inlined here) so each path's
   * exact Prisma argument object can be exercised in isolation against a real
   * (even unreachable) Prisma client in tests — Prisma validates argument
   * shape before it ever opens a connection, so that catches an invalid shape
   * a mock can't: `Organization.billingAccount` is an optional to-one
   * relation, so its relation-select args accept a `where`.
   * `BillingAccountOrganization.billingAccount` is a *required* to-one
   * relation — its relation-select args have no `where` at all, so its
   * `isDeleted`/`organization.isDeleted` checks are relation filters on the
   * root `where` instead of a nested `where` (see `findLinkedWallet`).
   */
  private async findAccessibleWallet(
    organizationId: string,
    filter: WalletLookupFilter,
    client: PrismaService | PrismaTransactionClient,
    isBillingAccountPreauthorized = false,
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

    if (!isBillingAccountPreauthorized || !filter.billingAccountId) {
      return null;
    }

    return this.findReservationAuthorizedWallet(
      filter.billingAccountId,
      filter,
      client,
    );
  }

  /** Path 1: a wallet the requesting organization owns outright. */
  private async findOwnWallet(
    organizationId: string,
    filter: WalletLookupFilter,
    client: PrismaService | PrismaTransactionClient,
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
    client: PrismaService | PrismaTransactionClient,
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
    client: PrismaService | PrismaTransactionClient,
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
   * Path 4: a wallet on a BillingAccount the caller has already proven
   * `organizationId` transacted against through an independently
   * tenant-scoped row (a `CreditReservation` matched with `scopedWhere`),
   * even if the organization has since detached from that billing account.
   * Reads through `BillingAccount` directly rather than re-deriving
   * current-day link status — `BillingAccount` carries no `organizationId`,
   * so it is not a tenant-scoped model, and access here is authorized by the
   * caller's own proof, not by this query.
   */
  private async findReservationAuthorizedWallet(
    billingAccountId: string,
    filter: WalletLookupFilter,
    client: PrismaService | PrismaTransactionClient,
  ): Promise<CreditBalanceDocument | null> {
    const viaReservation = await client.billingAccount.findFirst({
      select: { creditBalances: creditBalanceLookup(filter) },
      where: { id: billingAccountId, isDeleted: false },
    });

    return viaReservation?.creditBalances[0] ?? null;
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
  ): Promise<ICreditWalletSnapshot> {
    const balanceDelta = input.balanceDelta ?? 0;
    const heldDelta = input.heldDelta ?? 0;
    const maxOverdraftCredits = Math.max(0, input.maxOverdraftCredits ?? 0);
    const balance = await this.getOrCreateBalance(
      organizationId,
      tx,
      input.billingAccountId,
      input.isBillingAccountPreauthorized,
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
      input.isBillingAccountPreauthorized,
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
