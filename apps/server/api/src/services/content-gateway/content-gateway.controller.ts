import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { RequiredScopes } from '@api/helpers/decorators/scopes/required-scopes.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { serializeCollection } from '@api/helpers/utils/response/response.util';
import { ContentGatewayService } from '@api/services/content-gateway/content-gateway.service';
import {
  ExecuteSkillDto,
  RouteSignalDto,
} from '@api/services/content-gateway/dto/content-gateway.dto';
import type {
  ContentGatewayResponse,
  ContentGatewayResult,
} from '@api/services/content-gateway/interfaces/content-gateway.interfaces';
import { ApiKeyScope } from '@genfeedai/contracts';
import { PostSerializer } from '@genfeedai/serializers';
import { Body, Controller, Post, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

@ApiTags('ContentGateway')
@Controller('content-gateway')
export class ContentGatewayController {
  constructor(private readonly contentGatewayService: ContentGatewayService) {}

  @Post('signal')
  @RequiredScopes(ApiKeyScope.ADMIN)
  async routeSignal(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Body() dto: RouteSignalDto,
  ): Promise<ContentGatewayResponse> {
    const organization = user.organizationId;
    const userId = user.userId ?? user.id;

    const result = await this.contentGatewayService.routeSignal({
      brandId: dto.brandId,
      organizationId: organization,
      payload: dto.payload,
      type: dto.type,
      userId,
    });
    return this.serializeResult(request, result);
  }

  @Post('execute')
  @RequiredScopes(ApiKeyScope.ADMIN)
  async executeSkill(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Body() dto: ExecuteSkillDto,
  ): Promise<ContentGatewayResponse> {
    const organization = user.organizationId;
    const userId = user.userId ?? user.id;

    const result = await this.contentGatewayService.processManualRequest(
      organization,
      dto.brandId,
      dto.skillSlug,
      dto.params,
      userId,
    );
    return this.serializeResult(request, result);
  }

  private serializeResult(
    request: Request,
    result: ContentGatewayResult,
  ): ContentGatewayResponse {
    return {
      executions: result.executions,
      posts: serializeCollection(request, PostSerializer, {
        docs: result.posts,
      }),
    };
  }
}
