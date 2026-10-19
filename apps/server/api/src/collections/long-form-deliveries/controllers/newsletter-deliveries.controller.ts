import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { CreateNewsletterDeliveryDto } from '@api/collections/long-form-deliveries/dto/create-newsletter-delivery.dto';
import { LongFormDeliveriesService } from '@api/collections/long-form-deliveries/services/long-form-deliveries.service';
import { OrganizationModule } from '@api/common/organization-modules/organization-module.decorator';
import { FeatureFlag } from '@api/feature-flag/feature-flag.decorator';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { RequiredScopes } from '@api/helpers/decorators/scopes/required-scopes.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { TenantReadPolicy } from '@api/helpers/interceptors/tenant-context/tenant-read-policy.decorator';
import { resolveTenantReadScope } from '@api/helpers/interceptors/tenant-context/tenant-read-scope.context';
import {
  assertApiKeyPublishingScope,
  type PublishingCapability,
} from '@api/helpers/utils/auth/api-key-publishing-scope.util';
import { extractRequestContext } from '@api/helpers/utils/auth/auth.util';
import {
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import { ApiKeyScope } from '@genfeedai/contracts';
import type { NewsletterDeliveryMode } from '@genfeedai/contracts/constants';
import {
  ChannelTargetSerializer,
  ReleaseGroupSerializer,
} from '@genfeedai/serializers';
import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

const CAPABILITY_BY_MODE = {
  draft: 'draft',
  schedule: 'schedule',
  send: 'publish',
} as const satisfies Record<NewsletterDeliveryMode, PublishingCapability>;

/**
 * Newsletter → connected Beehiiv publication (#6753). Each delivery is a
 * one-target scheduler release linked to the newsletter. Substack has no
 * publishing API; it imports published issues from the brand feed instead.
 */
@AutoSwagger()
@ApiTags('Newsletters')
@FeatureFlag('publishing')
@OrganizationModule('publishing')
@Controller('newsletters')
export class NewsletterDeliveriesController {
  constructor(
    private readonly longFormDeliveriesService: LongFormDeliveriesService,
  ) {}

  @TenantReadPolicy('selected')
  @Get(':newsletterId/deliveries')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async findAll(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('newsletterId') newsletterId: string,
  ) {
    const { organizationId } = resolveTenantReadScope(user);
    const targets =
      await this.longFormDeliveriesService.listNewsletterDeliveries(
        organizationId,
        newsletterId,
      );
    return serializeCollection(request, ChannelTargetSerializer, {
      docs: targets,
    });
  }

  @Post(':newsletterId/deliveries')
  @RequiredScopes(
    ApiKeyScope.POSTS_DRAFT,
    ApiKeyScope.POSTS_SCHEDULE,
    ApiKeyScope.POSTS_PUBLISH,
  )
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async create(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('newsletterId') newsletterId: string,
    @Body() dto: CreateNewsletterDeliveryDto,
  ) {
    assertApiKeyPublishingScope(user, CAPABILITY_BY_MODE[dto.mode]);
    const release = await this.longFormDeliveriesService.deliverNewsletter(
      extractRequestContext(user),
      newsletterId,
      dto,
    );
    return serializeSingle(request, ReleaseGroupSerializer, release);
  }
}
