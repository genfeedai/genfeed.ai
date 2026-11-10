import { SuperAdminGuard } from '@api/common/guards/super-admin.guard';
import { AdminCommunityService } from '@api/endpoints/admin/community/community.service';
import { IpWhitelistGuard } from '@api/endpoints/admin/guards/ip-whitelist.guard';
import { isEntityId } from '@api/helpers/validation/entity-id.validator';
import type { IAdminCommunityOverviewResponse } from '@genfeedai/contracts/interfaces';
import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  Param,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

function assertIds(...ids: string[]): void {
  if (!ids.every((id) => isEntityId(id))) {
    throw new BadRequestException('Invalid identifier');
  }
}

function parsePage(page?: string): number {
  const parsed = Math.trunc(Number(page));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

/**
 * Curate genfeed.ai/community (#9670) for one organization: feature its public
 * creators and media, or take them off community. Members cannot feature
 * their own work; this is platform curation behind the same IP allowlist and
 * superadmin guards as the other platform settings.
 */
@ApiTags('Admin / Community')
@Controller('admin/organizations/:organizationId/community')
@UseGuards(IpWhitelistGuard, SuperAdminGuard)
export class AdminCommunityController {
  constructor(private readonly communityService: AdminCommunityService) {}

  @Get()
  @ApiOperation({
    summary: "The organization's public creators and media on community",
  })
  async overview(
    @Param('organizationId') organizationId: string,
    @Query('page') page?: string,
  ): Promise<IAdminCommunityOverviewResponse> {
    assertIds(organizationId);
    return {
      data: await this.communityService.getOverview(
        organizationId,
        parsePage(page),
      ),
    };
  }

  @Put('creators/:brandId/featured')
  @ApiOperation({ summary: 'Feature a creator on community' })
  async featureCreator(
    @Param('organizationId') organizationId: string,
    @Param('brandId') brandId: string,
  ) {
    assertIds(organizationId, brandId);
    return {
      data: await this.communityService.setCreatorFeatured(
        organizationId,
        brandId,
        true,
      ),
    };
  }

  @Delete('creators/:brandId/featured')
  @ApiOperation({ summary: 'Stop featuring a creator on community' })
  async unfeatureCreator(
    @Param('organizationId') organizationId: string,
    @Param('brandId') brandId: string,
  ) {
    assertIds(organizationId, brandId);
    return {
      data: await this.communityService.setCreatorFeatured(
        organizationId,
        brandId,
        false,
      ),
    };
  }

  @Delete('creators/:brandId')
  @ApiOperation({ summary: "Take a creator's public profile off genfeed.ai" })
  async unpublishCreator(
    @Param('organizationId') organizationId: string,
    @Param('brandId') brandId: string,
  ) {
    assertIds(organizationId, brandId);
    return {
      data: await this.communityService.unpublishCreator(
        organizationId,
        brandId,
      ),
    };
  }

  @Put('media/:ingredientId/featured')
  @ApiOperation({ summary: 'Feature a public image or video on community' })
  async featureMedia(
    @Param('organizationId') organizationId: string,
    @Param('ingredientId') ingredientId: string,
  ) {
    assertIds(organizationId, ingredientId);
    return {
      data: await this.communityService.setMediaFeatured(
        organizationId,
        ingredientId,
        true,
      ),
    };
  }

  @Delete('media/:ingredientId/featured')
  @ApiOperation({ summary: 'Stop featuring an image or video on community' })
  async unfeatureMedia(
    @Param('organizationId') organizationId: string,
    @Param('ingredientId') ingredientId: string,
  ) {
    assertIds(organizationId, ingredientId);
    return {
      data: await this.communityService.setMediaFeatured(
        organizationId,
        ingredientId,
        false,
      ),
    };
  }

  @Delete('media/:ingredientId')
  @ApiOperation({ summary: 'Take an image or video off community' })
  async unpublishMedia(
    @Param('organizationId') organizationId: string,
    @Param('ingredientId') ingredientId: string,
  ) {
    assertIds(organizationId, ingredientId);
    return {
      data: await this.communityService.unpublishMedia(
        organizationId,
        ingredientId,
      ),
    };
  }
}
