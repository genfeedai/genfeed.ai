import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import {
  RefreshSocialTimelineDto,
  SourcePostNativeActionDto,
} from '@api/collections/social-sources/dto/social-timeline.dto';
import { FeatureFlag } from '@api/feature-flag/feature-flag.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { BrandScopeQueryDto } from '@api/helpers/dto/brand-scope-query.dto';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { resolveRequiredBrandRequestContext } from '@api/helpers/utils/auth/auth.util';
import { SocialTimelineService } from '@api/services/social-timeline/social-timeline.service';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('Following')
@FeatureFlag('discovery')
@UseGuards(RolesGuard)
@Controller('social-timelines')
export class SocialTimelineController {
  constructor(private readonly timelines: SocialTimelineService) {}

  @Get()
  read(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: BrandScopeQueryDto,
  ) {
    return this.timelines.read(resolveRequiredBrandRequestContext(user, query));
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  refresh(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: BrandScopeQueryDto,
    @Body() body: RefreshSocialTimelineDto,
  ) {
    return this.timelines.refresh(
      resolveRequiredBrandRequestContext(user, query),
      body.credentialId,
    );
  }

  @Post('posts/:id/actions')
  @HttpCode(HttpStatus.OK)
  act(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: BrandScopeQueryDto,
    @Param('id') id: string,
    @Body() body: SourcePostNativeActionDto,
  ) {
    return this.timelines.act(
      resolveRequiredBrandRequestContext(user, query),
      id,
      body,
    );
  }
}
