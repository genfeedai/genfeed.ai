import { CreditTransactionsService } from '@api/collections/credits/services/credit-transactions.service';
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { SuperAdminGuard } from '@api/common/guards/super-admin.guard';
import { IpWhitelistGuard } from '@api/endpoints/admin/guards/ip-whitelist.guard';
import { serializeCollection } from '@api/helpers/utils/response/response.util';
import { RateLimit } from '@api/shared/decorators/rate-limit/rate-limit.decorator';
import { AdminCreditLedgerEntrySerializer } from '@genfeedai/serializers';
import { runWithTenantContext } from '@libs/prisma/tenant-context';
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';

const ADMIN_GRANT_SOURCE = 'admin-grant';
const DEFAULT_EXPIRY_DAYS = 365;
const MAX_GRANT = 100_000;
const DEFAULT_LEDGER_LIMIT = 200;
const MAX_LEDGER_LIMIT = 500;
const MAX_LEDGER_WINDOW_MS = 31 * 86_400_000;

const identifier = z.string().trim().min(1).max(200);
const grantSchema = z
  .object({
    amount: z.number().int().positive().max(MAX_GRANT),
    expiresInDays: z.number().int().positive().max(3650).optional(),
    idempotencyKey: z.string().trim().min(8).max(200).optional(),
    reason: z.string().trim().min(8).max(500),
  })
  .strict();

const ledgerQuerySchema = z
  .object({
    from: z.iso.datetime({ offset: true }),
    limit: z.coerce
      .number()
      .int()
      .positive()
      .max(MAX_LEDGER_LIMIT)
      .default(DEFAULT_LEDGER_LIMIT),
    to: z.iso.datetime({ offset: true }),
  })
  .strict()
  .transform(({ from, limit, to }) => ({
    createdFrom: new Date(from),
    createdTo: new Date(to),
    limit,
  }))
  .refine(
    ({ createdFrom, createdTo }) =>
      createdFrom < createdTo &&
      createdTo.getTime() - createdFrom.getTime() <= MAX_LEDGER_WINDOW_MS,
  );

@Controller('admin/organizations/:organizationId/credits')
@UseGuards(IpWhitelistGuard, SuperAdminGuard)
export class AdminOrganizationCreditsController {
  constructor(
    private readonly credits: CreditsUtilsService,
    private readonly transactions: CreditTransactionsService,
  ) {}

  /**
   * Read-only audit of one organization's ledger in a time window, newest
   * first, with the actor, brand and reservation behind each row. It works for
   * an organization the operator is not a member of, so an unexplained charge
   * can be traced to its source.
   */
  @Get('ledger')
  @RateLimit({ limit: 30, scope: 'user', windowMs: 60_000 })
  async ledger(
    @Req() request: Request,
    @Param('organizationId') organizationId: string,
    @Query() query: unknown,
  ) {
    if (!identifier.safeParse(organizationId).success) {
      throw new BadRequestException('Invalid identifier');
    }
    const parsed = ledgerQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw new BadRequestException(
        'from and to must be ISO timestamps at most 31 days apart, with from before to',
      );
    }

    const { createdFrom, createdTo, limit } = parsed.data;
    return runWithTenantContext({ organizationId }, async () => {
      const docs = await this.transactions.getOrganizationTransactions(
        organizationId,
        limit,
        0,
        { createdFrom, createdTo },
      );
      return serializeCollection(request, AdminCreditLedgerEntrySerializer, {
        docs,
      });
    });
  }

  @Post()
  @RateLimit({ limit: 10, scope: 'user', windowMs: 60_000 })
  async grant(
    @Req() request: Request,
    @Param('organizationId') organizationId: string,
    @Body() body: unknown,
  ) {
    if (!identifier.safeParse(organizationId).success) {
      throw new BadRequestException('Invalid identifier');
    }
    const parsed = grantSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(
        'A positive whole-number amount and a grant reason are required',
      );
    }
    const operatorUserId = request.context?.userId;
    if (!operatorUserId) {
      throw new UnauthorizedException();
    }

    const { amount, expiresInDays, idempotencyKey, reason } = parsed.data;
    const expiresAt = new Date(
      Date.now() + (expiresInDays ?? DEFAULT_EXPIRY_DAYS) * 86_400_000,
    );

    return runWithTenantContext({ organizationId }, async () => {
      await this.credits.addOrganizationCreditsWithExpiration(
        organizationId,
        amount,
        ADMIN_GRANT_SOURCE,
        reason,
        expiresAt,
        { actorUserId: operatorUserId, idempotencyKey },
      );
      const balance =
        await this.credits.getOrganizationCreditsBalance(organizationId);
      return {
        data: {
          balance,
          creditsGranted: amount,
          expiresAt: expiresAt.toISOString(),
          organizationId,
        },
      };
    });
  }
}
