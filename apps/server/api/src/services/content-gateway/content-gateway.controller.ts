import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { serializeCollection } from '@api/helpers/utils/response/response.util';
import {
  ExecuteSkillDto,
  RouteSignalDto,
} from '@api/services/content-gateway/dto/content-gateway.dto';
import { PostSerializer } from '@genfeedai/serializers';
import { Body, Controller, Post, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { AuthenticatedUser as User } from '@server/auth/interfaces/authenticated-user.interface';
import { ContentGatewayService } from '@server/services/content-gateway/content-gateway.service';
import type {
  ContentGatewayResponse,
  ContentGatewayResult,
} from '@server/services/content-gateway/interfaces/content-gateway.interfaces';
import type { Request } from 'express';

@ApiTags('ContentGateway')
@Controller('content-gateway')
export class ContentGatewayController {
  constructor(private readonly contentGatewayService: ContentGatewayService) {}

  @Post('signal')
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
