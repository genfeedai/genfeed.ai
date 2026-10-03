import { GenerationHoldRecoveryService } from '@api/collections/credits/services/generation-hold-recovery.service';
import { SuperAdminGuard } from '@api/common/guards/super-admin.guard';
import { IpWhitelistGuard } from '@api/endpoints/admin/guards/ip-whitelist.guard';
import { serializeSingle } from '@api/helpers/utils/response/response.util';
import { RateLimit } from '@api/shared/decorators/rate-limit/rate-limit.decorator';
import { CreditHoldRecoveryAction } from '@genfeedai/contracts';
import { CreditHoldReportSerializer } from '@genfeedai/serializers';
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

const identifier = z.string().trim().min(1).max(200);
const actionSchema = z
  .object({
    action: z.enum(CreditHoldRecoveryAction),
    reason: z.string().trim().min(8).max(500),
  })
  .strict();

@Controller('admin/organizations/:organizationId/credit-holds')
@UseGuards(IpWhitelistGuard, SuperAdminGuard)
export class AdminCreditHoldsController {
  constructor(private readonly holds: GenerationHoldRecoveryService) {}

  @Get()
  @RateLimit({ limit: 30, scope: 'user', windowMs: 60_000 })
  async list(
    @Req() request: Request,
    @Param('organizationId') organizationId: string,
    @Query('cursor') cursor?: string,
  ) {
    this.validateId(organizationId);
    if (cursor) this.validateId(cursor);
    return runWithTenantContext({ organizationId }, async () =>
      serializeSingle(
        request,
        CreditHoldReportSerializer,
        await this.holds.list(organizationId, cursor),
      ),
    );
  }

  @Post(':reservationId/actions')
  @RateLimit({ limit: 10, scope: 'user', windowMs: 60_000 })
  async act(
    @Req() request: Request,
    @Param('organizationId') organizationId: string,
    @Param('reservationId') reservationId: string,
    @Body() body: unknown,
  ) {
    this.validateId(organizationId);
    this.validateId(reservationId);
    const parsed = actionSchema.safeParse(body);
    if (!parsed.success)
      throw new BadRequestException(
        'A release or charge action and recovery reason are required',
      );
    const operatorUserId = request.context?.userId;
    if (!operatorUserId) throw new UnauthorizedException();
    return runWithTenantContext({ organizationId }, async () => {
      await this.holds.apply({
        ...parsed.data,
        organizationId,
        reservationId,
        operatorUserId,
      });
      return serializeSingle(
        request,
        CreditHoldReportSerializer,
        await this.holds.list(organizationId),
      );
    });
  }

  private validateId(value: string): void {
    if (!identifier.safeParse(value).success)
      throw new BadRequestException('Invalid identifier');
  }
}
