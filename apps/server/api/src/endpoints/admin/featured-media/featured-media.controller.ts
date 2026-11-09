import { SuperAdminGuard } from '@api/common/guards/super-admin.guard';
import { AdminFeaturedMediaService } from '@api/endpoints/admin/featured-media/featured-media.service';
import { IpWhitelistGuard } from '@api/endpoints/admin/guards/ip-whitelist.guard';
import { isEntityId } from '@api/helpers/validation/entity-id.validator';
import {
  BadRequestException,
  Controller,
  Delete,
  Param,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

/**
 * Feature public images and videos on genfeed.ai/community (#9670). Members
 * cannot set the flag themselves; it is platform curation behind the same IP
 * allowlist and superadmin guards as the other platform settings.
 */
@ApiTags('Admin / Featured Media')
@Controller('admin/organizations/:organizationId/featured-media')
@UseGuards(IpWhitelistGuard, SuperAdminGuard)
export class AdminFeaturedMediaController {
  constructor(
    private readonly featuredMediaService: AdminFeaturedMediaService,
  ) {}

  @Put(':ingredientId')
  @ApiOperation({ summary: 'Feature a public image or video on community' })
  async feature(
    @Param('organizationId') organizationId: string,
    @Param('ingredientId') ingredientId: string,
  ) {
    return { data: await this.write(organizationId, ingredientId, true) };
  }

  @Delete(':ingredientId')
  @ApiOperation({ summary: 'Stop featuring an image or video on community' })
  async unfeature(
    @Param('organizationId') organizationId: string,
    @Param('ingredientId') ingredientId: string,
  ) {
    return { data: await this.write(organizationId, ingredientId, false) };
  }

  private write(
    organizationId: string,
    ingredientId: string,
    isHighlighted: boolean,
  ) {
    if (!isEntityId(organizationId) || !isEntityId(ingredientId)) {
      throw new BadRequestException('Invalid identifier');
    }
    return this.featuredMediaService.setFeatured(
      organizationId,
      ingredientId,
      isHighlighted,
    );
  }
}
