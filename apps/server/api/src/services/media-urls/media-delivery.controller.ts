import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import {
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import { AuthorizedMediaUrlService } from '@api/services/media-urls/authorized-media-url.service';
import {
  PrepareMediaPreviewsDto,
  PreparePublicMediaDto,
  PublicMediaGrantQueryDto,
} from '@api/services/media-urls/media-delivery.dto';
import { MediaDerivativePreparationService } from '@api/services/media-urls/media-derivative-preparation.service';
import { RateLimit } from '@api/shared/decorators/rate-limit/rate-limit.decorator';
import { RateLimitGuard } from '@api/shared/guards/rate-limit/rate-limit.guard';
import { MediaDeliveryGrantSerializer } from '@genfeedai/serializers';
import { Public } from '@libs/decorators/public.decorator';
import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';

@Controller('ingredients')
@UseGuards(RateLimitGuard)
export class MediaDeliveryController {
  constructor(
    private readonly issuer: AuthorizedMediaUrlService,
    private readonly preparation: MediaDerivativePreparationService,
  ) {}

  @Post('media-previews')
  @RateLimit({ limit: 10, scope: 'user', windowMs: 60_000 })
  async preparePreviews(
    @Req() request: Request,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: PrepareMediaPreviewsDto,
  ) {
    const scope = this.scope(user);
    await this.preparation.prepare(scope, dto.ids);
    const projections = await this.issuer.projectIngredients(scope, dto.ids);
    return serializeCollection(request, MediaDeliveryGrantSerializer, {
      docs: projections.map((projection) => projection.grant),
    });
  }

  @Post(':id/original-grant')
  @Header('Cache-Control', 'no-store')
  @RateLimit({ limit: 30, scope: 'user', windowMs: 60_000 })
  async original(
    @Req() request: Request,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return serializeSingle(
      request,
      MediaDeliveryGrantSerializer,
      await this.issuer.issueOriginal(this.scope(user), id),
    );
  }

  @Post(':id/public-derivative')
  @RateLimit({ limit: 10, scope: 'user', windowMs: 60_000 })
  async preparePublic(
    @Req() request: Request,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: PreparePublicMediaDto,
  ) {
    const scope = this.scope(user);
    await this.preparation.prepare(scope, [id], dto.purpose);
    return serializeSingle(
      request,
      MediaDeliveryGrantSerializer,
      await this.issuer.issuePublicDerivative(scope, id, dto.purpose),
    );
  }

  @Get(':id/public-grant')
  @RateLimit({ limit: 120, scope: 'ip', windowMs: 60_000 })
  @Public()
  @Header('Cache-Control', 'no-store')
  async publicGrant(
    @Req() request: Request,
    @Param('id') id: string,
    @Query() query: PublicMediaGrantQueryDto,
  ) {
    const [projection] = await this.issuer.projectPublicIngredients(
      [id],
      query.purpose,
    );
    if (!projection) throw new NotFoundException('Public media is unavailable');
    if (projection.grant.state === 'PENDING')
      await this.preparation.enqueuePublicMissing(
        [id],
        query.purpose ?? 'public-share',
      );
    return serializeSingle(
      request,
      MediaDeliveryGrantSerializer,
      projection.grant,
    );
  }

  private scope(user: AuthenticatedUser) {
    return {
      brandId: user.brandId,
      organizationId: user.organizationId,
      userId: user.userId || user.id,
    };
  }
}
