import { UpdateHarnessProfileDto } from '@api/collections/harness-profiles/dto/update-harness-profile.dto';
import { UpsertHarnessProfileDto } from '@api/collections/harness-profiles/dto/upsert-harness-profile.dto';
import { HarnessProfilesService } from '@api/collections/harness-profiles/services/harness-profiles.service';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { getPublicMetadata } from '@api/helpers/utils/clerk/clerk.util';
import {
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import type { User } from '@clerk/backend';
import { HarnessProfileSerializer } from '@genfeedai/serializers';
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

@AutoSwagger()
@ApiTags('Harness Profiles')
@Controller('harness-profiles')
export class HarnessProfilesController {
  constructor(
    private readonly harnessProfilesService: HarnessProfilesService,
  ) {}

  @Get()
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async findForBrand(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Query('brandId') brandId: string,
  ) {
    const { organization } = getPublicMetadata(user);
    const docs = brandId
      ? await this.harnessProfilesService.findForBrand(organization, brandId)
      : [];

    return serializeCollection(request, HarnessProfileSerializer, { docs });
  }

  @Get('active')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async getActiveForBrand(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Query('brandId') brandId: string,
  ) {
    const { organization } = getPublicMetadata(user);
    const profile = brandId
      ? await this.harnessProfilesService.getActiveForBrand(
          organization,
          brandId,
        )
      : null;

    return serializeSingle(request, HarnessProfileSerializer, profile);
  }

  @Post()
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async create(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Body() dto: UpsertHarnessProfileDto,
  ) {
    const { organization, user: userId } = getPublicMetadata(user);
    const profile = await this.harnessProfilesService.create(
      dto,
      organization,
      userId,
    );

    return serializeSingle(request, HarnessProfileSerializer, profile);
  }

  @Patch(':profileId')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async update(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('profileId') profileId: string,
    @Body() dto: UpdateHarnessProfileDto,
  ) {
    const { organization } = getPublicMetadata(user);
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
    const { organization } = getPublicMetadata(user);
    await this.harnessProfilesService.remove(profileId, organization);
    return { message: 'Harness profile deleted successfully' };
  }
}
