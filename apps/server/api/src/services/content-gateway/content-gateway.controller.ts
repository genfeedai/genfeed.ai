import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { getPublicMetadata } from '@api/helpers/utils/clerk/clerk.util';
import { ContentGatewayService } from '@api/services/content-gateway/content-gateway.service';
import {
  ExecuteSkillDto,
  RouteSignalDto,
} from '@api/services/content-gateway/dto/content-gateway.dto';
import type { User } from '@clerk/backend';
import { Body, Controller, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('ContentGateway')
@Controller('content-gateway')
export class ContentGatewayController {
  constructor(private readonly contentGatewayService: ContentGatewayService) {}

  @Post('signal')
  routeSignal(@CurrentUser() user: User, @Body() dto: RouteSignalDto) {
    const { organization } = getPublicMetadata(user);

    return this.contentGatewayService.routeSignal({
      brandId: dto.brandId,
      organizationId: dto.organizationId ?? organization,
      payload: dto.payload,
      type: dto.type,
    });
  }

  @Post('execute')
  executeSkill(@CurrentUser() user: User, @Body() dto: ExecuteSkillDto) {
    const { organization } = getPublicMetadata(user);

    return this.contentGatewayService.processManualRequest(
      organization,
      dto.brandId,
      dto.skillSlug,
      dto.params,
    );
  }
}
