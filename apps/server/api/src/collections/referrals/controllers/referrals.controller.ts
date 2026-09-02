import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { ClaimReferralDto } from '@api/collections/referrals/dto/claim-referral.dto';
import {
  REFERRAL_ADMIN_MAX_PAGE,
  ReferralsService,
} from '@api/collections/referrals/services/referrals.service';
import type { RequestWithContext } from '@api/common/middleware/request-context.middleware';
import { RolesDecorator } from '@api/helpers/decorators/roles/roles.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import {
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import { RateLimit } from '@api/shared/decorators/rate-limit/rate-limit.decorator';
import { ReferralRewardStatus } from '@genfeedai/enums';
import {
  ReferralAdminRewardSerializer,
  ReferralProgramSerializer,
  ReferralRewardSerializer,
} from '@genfeedai/serializers';
import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

const ADMIN_DEFAULT_LIMIT = 50;
const ADMIN_MAX_LIMIT = 100;

function parsePaginationValue(
  rawValue: string | undefined,
  fallback: number,
  maximum: number,
): number {
  if (!rawValue) {
    return fallback;
  }
  const parsed = Number(rawValue);
  if (!Number.isSafeInteger(parsed)) {
    return fallback;
  }
  return Math.min(Math.max(parsed, 1), maximum);
}

@AutoSwagger()
@ApiTags('Referrals')
@Controller('referrals')
@UseGuards(RolesGuard)
export class ReferralsController {
  constructor(private readonly referralsService: ReferralsService) {}

  @Get('me')
  @RateLimit({ limit: 60, scope: 'user', windowMs: 60_000 })
  async getMine(@Req() request: RequestWithContext, @CurrentUser() user: User) {
    const program = await this.referralsService.getMine(
      this.actor(request, user),
    );
    return serializeSingle(request, ReferralProgramSerializer, program);
  }

  @Get('me/rewards')
  @RateLimit({ limit: 60, scope: 'user', windowMs: 60_000 })
  async listMine(
    @Req() request: RequestWithContext,
    @CurrentUser() user: User,
  ) {
    const docs = await this.referralsService.listMyRewards(
      this.actor(request, user),
    );
    return serializeCollection(request, ReferralRewardSerializer, { docs });
  }

  @Post('me/claim')
  @RateLimit({ limit: 10, scope: 'user', windowMs: 60_000 })
  async claim(
    @Req() request: RequestWithContext,
    @CurrentUser() user: User,
    @Body() body: ClaimReferralDto,
  ) {
    return this.referralsService.claim(this.actor(request, user), body.code);
  }

  @Get('admin/rewards')
  @RolesDecorator('superadmin')
  @RateLimit({ limit: 60, scope: 'user', windowMs: 60_000 })
  async listAdmin(
    @Req() request: RequestWithContext,
    @Query('limit') rawLimit?: string,
    @Query('page') rawPage?: string,
    @Query('status') rawStatus?: ReferralRewardStatus,
  ) {
    const limit = parsePaginationValue(
      rawLimit,
      ADMIN_DEFAULT_LIMIT,
      ADMIN_MAX_LIMIT,
    );
    const page = parsePaginationValue(rawPage, 1, REFERRAL_ADMIN_MAX_PAGE);
    const status = Object.values(ReferralRewardStatus).includes(
      rawStatus as ReferralRewardStatus,
    )
      ? rawStatus
      : undefined;
    const result = await this.referralsService.listAdmin({
      limit,
      page,
      ...(status ? { status } : {}),
    });
    return serializeCollection(request, ReferralAdminRewardSerializer, {
      docs: result.docs,
      limit,
      page,
      totalDocs: result.total,
      totalPages: Math.ceil(result.total / Math.max(limit, 1)),
    });
  }

  private actor(request: RequestWithContext, user: User) {
    const organizationId =
      request.context?.organizationId ?? user.organizationId;
    const userId = user.userId ?? user.id;
    if (!organizationId || !userId) {
      throw new UnauthorizedException('Active organization required');
    }
    return { organizationId, userId };
  }
}
