import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { UpsertStudioGenerateDraftDto } from '@api/collections/studio-generate-drafts/dto/upsert-studio-generate-draft.dto';
import {
  type StudioGenerateDraftRequestScope,
  StudioGenerateDraftsService,
} from '@api/collections/studio-generate-drafts/services/studio-generate-drafts.service';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { TenantReadPolicy } from '@api/helpers/interceptors/tenant-context/tenant-read-policy.decorator';
import { serializeSingle } from '@api/helpers/utils/response/response.util';
import type { JsonApiSingleResponse } from '@genfeedai/contracts/interfaces';
import { StudioGenerateDraftSerializer } from '@genfeedai/serializers';
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Put,
  Query,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import type { Request } from 'express';

@AutoSwagger()
@ApiBearerAuth()
@Controller('studio-generate-drafts')
export class StudioGenerateDraftsController {
  constructor(
    private readonly studioGenerateDraftsService: StudioGenerateDraftsService,
  ) {}

  @TenantReadPolicy('owner')
  @Get('current')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async findCurrent(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Query('brand') brand?: unknown,
  ): Promise<JsonApiSingleResponse> {
    // `?brand=a&brand=b` arrives as an array: one brand, or a 400.
    if (brand !== undefined && typeof brand !== 'string') {
      throw new BadRequestException('Query param `brand` must be one brand id');
    }
    const draft = await this.studioGenerateDraftsService.findCurrent(
      this.getScope(user, brand),
    );

    // No draft yet is the normal first-visit state, not a failed request.
    return draft
      ? serializeSingle(request, StudioGenerateDraftSerializer, draft)
      : { data: null };
  }

  @Put('current')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async upsertCurrent(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Body() dto: UpsertStudioGenerateDraftDto,
  ): Promise<JsonApiSingleResponse> {
    const draft = await this.studioGenerateDraftsService.upsertCurrent(
      dto,
      this.getScope(user, dto.brandId),
    );

    return serializeSingle(request, StudioGenerateDraftSerializer, draft);
  }

  /**
   * The brand comes from the requesting tab, not the member's last-selected
   * brand: two tabs on two brands must never write each other's draft. The
   * service verifies the brand belongs to the caller's organization.
   */
  private getScope(
    user: User,
    requestedBrandId: string | undefined,
  ): StudioGenerateDraftRequestScope {
    const organizationId = user.organizationId?.trim();
    const brandId = requestedBrandId?.trim();
    const userId = (user.userId ?? user.id)?.trim();

    if (!organizationId || !userId) {
      throw new UnauthorizedException('Authenticated workspace is required');
    }
    if (!brandId) {
      throw new BadRequestException('A brand is required');
    }

    return { brandId, organizationId, userId };
  }
}
