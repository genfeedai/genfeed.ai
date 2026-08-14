import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { PromoteWinnersDto } from '@api/collections/harness-profiles/dto/promote-winners.dto';
import { UpdateHarnessProfileDto } from '@api/collections/harness-profiles/dto/update-harness-profile.dto';
import { UpsertHarnessProfileDto } from '@api/collections/harness-profiles/dto/upsert-harness-profile.dto';
import { HarnessProfilesService } from '@api/collections/harness-profiles/services/harness-profiles.service';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import {
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import { HarnessWinnerPromotionService } from '@api/services/harness/harness-winner-promotion.service';
import { HarnessProfileSerializer } from '@genfeedai/serializers';
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Optional,
  Param,
  Patch,
  Post,
  Query,
  Req,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

@AutoSwagger()
@ApiTags('Harness Profiles')
@Controller('harness-profiles')
export class HarnessProfilesController {
  constructor(
    private readonly harnessProfilesService: HarnessProfilesService,
    @Optional()
    private readonly harnessWinnerPromotionService?: HarnessWinnerPromotionService,
    @Optional()
    private readonly moduleRef?: ModuleRef,
  ) {}

  @Get()
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async findForBrand(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Query('brandId') brandId: string,
    @Query('isActive') isActive?: string,
  ) {
    const organization = user.organizationId;
    if (!brandId?.trim()) {
      throw new BadRequestException('brandId query parameter is required');
    }

    const docs = await this.harnessProfilesService.findForBrand(
      organization,
      brandId,
      { isActive: isActive ? isActive === 'true' : undefined },
    );

    return serializeCollection(request, HarnessProfileSerializer, { docs });
  }

  @Post()
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async create(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Body() dto: UpsertHarnessProfileDto,
  ) {
    const organization = user.organizationId;
    const userId = user.userId ?? user.id;
    const profile = await this.harnessProfilesService.create(
      dto,
      organization,
      userId,
    );

    return serializeSingle(request, HarnessProfileSerializer, profile);
  }

  /**
   * Promote this week's top-performing posts into the brand's harness
   * performance-winners context base (structured entries, not a RAG product).
   */
  @Post('promote-winners')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async promoteWinners(
    @CurrentUser() user: User,
    @Body() dto: PromoteWinnersDto,
  ) {
    const organization = user.organizationId;
    if (!dto.brandId?.trim()) {
      throw new BadRequestException('brandId is required');
    }

    const harnessWinnerPromotionService =
      this.resolveHarnessWinnerPromotionService();
    if (!harnessWinnerPromotionService) {
      throw new ServiceUnavailableException(
        'Harness winner promotion is unavailable',
      );
    }
    return harnessWinnerPromotionService.promoteTopPerformers({
      brandId: dto.brandId,
      limit: dto.limit,
      organizationId: organization,
      platform: dto.platform,
    });
  }

  private resolveHarnessWinnerPromotionService():
    | HarnessWinnerPromotionService
    | undefined {
    if (this.harnessWinnerPromotionService) {
      return this.harnessWinnerPromotionService;
    }
    try {
      return this.moduleRef?.get(HarnessWinnerPromotionService, {
        strict: false,
      });
    } catch {
      return undefined;
    }
  }

  @Patch(':profileId')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async update(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('profileId') profileId: string,
    @Body() dto: UpdateHarnessProfileDto,
  ) {
    const organization = user.organizationId;
    const profile = await this.harnessProfilesService.update(
      profileId,
      dto,
      organization,
    );

    return serializeSingle(request, HarnessProfileSerializer, profile);
  }

  @Delete(':profileId')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async remove(
    @CurrentUser() user: User,
    @Param('profileId') profileId: string,
  ) {
    const organization = user.organizationId;
    await this.harnessProfilesService.remove(profileId, organization);
    return { message: 'Harness profile deleted successfully' };
  }
}
