import { SuperAdminGuard } from '@api/common/guards/super-admin.guard';
import { IpWhitelistGuard } from '@api/endpoints/admin/guards/ip-whitelist.guard';
import { AdminModelPricingService } from '@api/endpoints/admin/model-pricing/model-pricing.service';
import { ProviderPriceSyncService } from '@api/endpoints/admin/model-pricing/provider-price-sync.service';
import { serializeSingle } from '@api/helpers/utils/response/response.util';
import { RateLimit } from '@api/shared/decorators/rate-limit/rate-limit.decorator';
import {
  PROVIDER_PRICE_SYNC_TASKS,
  type ProviderPriceSyncProvider,
} from '@genfeedai/contracts/queue';
import { ModelPricingReportSerializer } from '@genfeedai/serializers';
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';

const modelIdSchema = z.string().trim().min(1).max(200);
const approveBodySchema = z
  .object({ expectedPendingVersion: z.string().min(1).max(500) })
  .strict();
const syncProviders = Object.keys(
  PROVIDER_PRICE_SYNC_TASKS,
) as ProviderPriceSyncProvider[];
const fixBodySchema = z
  .object({ modelIds: z.array(modelIdSchema).max(500).optional() })
  .strict();
const syncBodySchema = z
  .object({ provider: z.enum(['all', ...syncProviders]).default('all') })
  .strict();

@Controller('admin/model-pricing')
@UseGuards(IpWhitelistGuard, SuperAdminGuard)
export class AdminModelPricingController {
  constructor(
    private readonly pricing: AdminModelPricingService,
    private readonly priceSync: ProviderPriceSyncService,
  ) {}

  @Get()
  @RateLimit({ limit: 30, scope: 'user', windowMs: 60_000 })
  async getReport(@Req() request: Request) {
    return serializeSingle(
      request,
      ModelPricingReportSerializer,
      await this.pricing.getReport(this.reportSource(request)),
    );
  }

  /**
   * Queue the provider price import now instead of waiting for the weekly
   * schedule. The import lands pending rates; approving them stays a separate,
   * explicit step.
   */
  @Post('sync')
  @HttpCode(202)
  @RateLimit({ limit: 5, scope: 'user', windowMs: 60_000 })
  async sync(@Body() body: unknown) {
    const parsed = syncBodySchema.safeParse(body ?? {});
    if (!parsed.success)
      throw new BadRequestException(
        `provider must be one of: all, ${syncProviders.join(', ')}`,
      );
    const providers =
      parsed.data.provider === 'all' ? syncProviders : [parsed.data.provider];
    return { queued: await this.priceSync.enqueue(providers) };
  }

  /**
   * "Fix pricing" / "Fix all pricing": approve the pending provider rates of
   * the given models (every model that needs it when none are given) and queue
   * the provider price import for models that have no rates loaded yet.
   */
  @Post('fix')
  @HttpCode(200)
  @RateLimit({ limit: 5, scope: 'user', windowMs: 60_000 })
  async fix(@Req() request: Request, @Body() body: unknown) {
    const parsed = fixBodySchema.safeParse(body ?? {});
    if (!parsed.success)
      throw new BadRequestException('modelIds must be a list of model ids');
    const fixedBy = request.context?.userId;
    if (!fixedBy) throw new UnauthorizedException();
    const result = await this.pricing.fixPricing(fixedBy, parsed.data.modelIds);
    const providers = [
      ...new Set(result.syncQueued.map((entry) => entry.provider)),
    ].filter((provider): provider is ProviderPriceSyncProvider =>
      syncProviders.includes(provider as ProviderPriceSyncProvider),
    );
    if (providers.length > 0) await this.priceSync.enqueue(providers);
    return result;
  }

  /**
   * Promote a provider's pending rates to the reviewed contract (#6196). Under
   * the same superadmin and IP allowlist guards as the report; returns the
   * refreshed report.
   */
  @Post(':modelId/approve-rates')
  @RateLimit({ limit: 10, scope: 'user', windowMs: 60_000 })
  async approveRates(
    @Req() request: Request,
    @Param('modelId') modelId: string,
    @Body() body: unknown,
  ) {
    if (!modelIdSchema.safeParse(modelId).success)
      throw new BadRequestException('Invalid identifier');
    const parsed = approveBodySchema.safeParse(body);
    if (!parsed.success)
      throw new BadRequestException('expectedPendingVersion is required');
    const approvedBy = request.context?.userId;
    if (!approvedBy) throw new UnauthorizedException();
    await this.pricing.approveRates(
      modelId,
      approvedBy,
      parsed.data.expectedPendingVersion,
    );
    return serializeSingle(
      request,
      ModelPricingReportSerializer,
      await this.pricing.getReport(
        this.reportSource(request).replace(/\/[^/]+\/approve-rates$/, ''),
      ),
    );
  }

  private reportSource(request: Request): string {
    return `${request.protocol}://${request.get('host')}${request.originalUrl.split('?')[0]}`;
  }
}
