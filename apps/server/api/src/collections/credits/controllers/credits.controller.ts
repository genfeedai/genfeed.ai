import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { CreditTransactionsService } from '@api/collections/credits/services/credit-transactions.service';
import { TopbarBalancesService } from '@api/collections/credits/services/topbar-balances.service';
import {
  CACHE_PATTERNS,
  CACHE_TAGS,
} from '@api/common/constants/cache-patterns.constants';
import type { RequestWithContext } from '@api/common/middleware/request-context.middleware';
import { Cache } from '@api/helpers/decorators/cache/cache.decorator';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import {
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import { ByokBillingService } from '@api/services/byok-billing/byok-billing.service';
import { RateLimit } from '@api/shared/decorators/rate-limit/rate-limit.decorator';
import {
  ByokUsageSummarySerializer,
  CreditTransactionSerializer,
  CreditUsageSerializer,
  LastPurchaseBaselineSerializer,
  TopbarBalancesSerializer,
} from '@genfeedai/serializers';
import { LoggerService } from '@libs/logger/logger.service';
import { Controller, Get, Optional, Query, Req } from '@nestjs/common';
import type { Request } from 'express';

@AutoSwagger()
@Controller('credits')
export class CreditsController {
  constructor(
    private readonly creditTransactionsService: CreditTransactionsService,
    private readonly topbarBalancesService: TopbarBalancesService,
    readonly _loggerService: LoggerService,
    @Optional() private readonly byokBillingService?: ByokBillingService,
  ) {}

  @Get('usage')
  @RateLimit({ limit: 20, scope: 'user', windowMs: 60000 })
  @Cache({
    keyGenerator: (req) => {
      const orgId =
        (req as RequestWithContext).context?.organizationId ??
        (req.user as User | undefined)?.organizationId ??
        'unknown';
      return CACHE_PATTERNS.CREDITS_USAGE(orgId);
    },
    tags: [CACHE_TAGS.CREDITS],
    ttl: 60,
  })
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async getUsageMetrics(
    @Req() req: RequestWithContext,
    @CurrentUser() user: User,
  ) {
    const organizationId =
      req.context?.organizationId ?? user.organizationId.toString();

    const data =
      await this.creditTransactionsService.getUsageMetrics(organizationId);

    return serializeSingle(req, CreditUsageSerializer, data);
  }

  /**
   * Org credit ledger for Settings → Usage. Optional brandId filters rows that
   * recorded brandId in transaction metadata (agent/gen call sites).
   */
  @Get('transactions')
  @RateLimit({ limit: 30, scope: 'user', windowMs: 60000 })
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async listTransactions(
    @Req() req: RequestWithContext,
    @CurrentUser() user: User,
    @Query('brandId') brandId?: string,
    @Query('category') category?: string,
    @Query('source') source?: string,
    @Query('limit') limitRaw?: string,
    @Query('skip') skipRaw?: string,
  ) {
    const organizationId =
      req.context?.organizationId ?? user.organizationId.toString();

    const limit = Math.min(
      Math.max(Number.parseInt(limitRaw ?? '50', 10) || 50, 1),
      200,
    );
    const skip = Math.max(Number.parseInt(skipRaw ?? '0', 10) || 0, 0);

    const docs =
      await this.creditTransactionsService.getOrganizationTransactions(
        organizationId,
        limit,
        skip,
        {
          brandId: brandId?.trim() || undefined,
          category: category?.trim() || undefined,
          source: source?.trim() || undefined,
        },
      );

    return serializeCollection(req, CreditTransactionSerializer, { docs });
  }

  @Get('byok-usage-summary')
  @RateLimit({ limit: 20, scope: 'user', windowMs: 60000 })
  @Cache({
    keyGenerator: (req) => {
      const orgId = (req.user as User | undefined)?.organizationId ?? 'unknown';
      return CACHE_PATTERNS.CREDITS_BYOK(orgId);
    },
    tags: [CACHE_TAGS.CREDITS],
    ttl: 60,
  })
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async getByokUsageSummary(@Req() req: Request, @CurrentUser() user: User) {
    const organizationId = user.organizationId.toString();

    if (!this.byokBillingService) {
      const fallback = {
        billableUsage: 0,
        billingStatus: 'active',
        freeRemaining: 500,
        freeThreshold: 500,
        periodEnd: new Date(),
        periodStart: new Date(),
        projectedFee: 0,
        rollover: 0,
        totalUsage: 0,
      };
      return serializeSingle(req, ByokUsageSummarySerializer, fallback);
    }

    const data =
      await this.byokBillingService.getByokUsageSummary(organizationId);
    return serializeSingle(req, ByokUsageSummarySerializer, data);
  }

  @Get('topbar-balances')
  @RateLimit({ limit: 30, scope: 'user', windowMs: 60000 })
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async getTopbarBalances(
    @Req() req: RequestWithContext,
    @CurrentUser() user: User,
  ) {
    const organizationId =
      req.context?.organizationId ?? user.organizationId.toString();

    const data =
      await this.topbarBalancesService.getTopbarBalances(organizationId);
    return serializeSingle(req, TopbarBalancesSerializer, data);
  }

  @Get('last-purchase-baseline')
  @RateLimit({ limit: 20, scope: 'user', windowMs: 60000 })
  @Cache({
    keyGenerator: (req) => {
      const orgId = (req.user as User | undefined)?.organizationId ?? 'unknown';
      return CACHE_PATTERNS.CREDITS_LAST_PURCHASE_BASELINE(orgId);
    },
    tags: [CACHE_TAGS.CREDITS],
    ttl: 60,
  })
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async getLastPurchaseBaseline(
    @Req() req: Request,
    @CurrentUser() user: User,
  ) {
    const organizationId = user.organizationId.toString();

    const data =
      await this.creditTransactionsService.getLastPurchaseBaseline(
        organizationId,
      );

    return serializeSingle(req, LastPurchaseBaselineSerializer, data);
  }
}
