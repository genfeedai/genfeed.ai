import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { PostGroupsService } from '@api/collections/post-groups/services/post-groups.service';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { getPublicMetadata } from '@api/helpers/utils/auth/auth.util';
import { serializeSingle } from '@api/helpers/utils/response/response.util';
import { ReleaseGroupSerializer } from '@genfeedai/serializers';
import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

@AutoSwagger()
@ApiTags('PostGroups')
@Controller('post-groups')
export class PostGroupsController {
  constructor(private readonly postGroupsService: PostGroupsService) {}

  @Post()
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async create(
    @Req() req: Request,
    @CurrentUser() user: User,
    @Body() body: unknown,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    const { organization } = getPublicMetadata(user);
    const data = await this.postGroupsService.create(
      organization,
      user.id,
      body,
      idempotencyKey,
    );
    return serializeSingle(req, ReleaseGroupSerializer, data);
  }

  @Get(':id')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async getOne(
    @Req() req: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
  ) {
    const { organization } = getPublicMetadata(user);
    const data = await this.postGroupsService.getOne(organization, id);
    return serializeSingle(req, ReleaseGroupSerializer, data);
  }

  @Patch(':id')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async update(
    @Req() req: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const { organization } = getPublicMetadata(user);
    const data = await this.postGroupsService.update(
      organization,
      user.id,
      id,
      body,
    );
    return serializeSingle(req, ReleaseGroupSerializer, data);
  }

  @Patch(':id/targets/:targetId')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async updateTarget(
    @Req() req: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Param('targetId') targetId: string,
    @Body() body: unknown,
  ) {
    const { organization } = getPublicMetadata(user);
    const data = await this.postGroupsService.updateTarget(
      organization,
      user.id,
      id,
      targetId,
      body,
    );
    return serializeSingle(req, ReleaseGroupSerializer, data);
  }

  @Post(':id/cancel')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async cancel(
    @Req() req: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
  ) {
    const { organization } = getPublicMetadata(user);
    const data = await this.postGroupsService.cancel(organization, user.id, id);
    return serializeSingle(req, ReleaseGroupSerializer, data);
  }

  @Post(':id/pause')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async pause(
    @Req() req: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
  ) {
    const { organization } = getPublicMetadata(user);
    const data = await this.postGroupsService.pause(organization, user.id, id);
    return serializeSingle(req, ReleaseGroupSerializer, data);
  }

  @Post(':id/resume')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async resume(
    @Req() req: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
  ) {
    const { organization } = getPublicMetadata(user);
    const data = await this.postGroupsService.resume(organization, user.id, id);
    return serializeSingle(req, ReleaseGroupSerializer, data);
  }

  @Post(':id/publish-now')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async publishNow(
    @Req() req: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
  ) {
    const { organization } = getPublicMetadata(user);
    const data = await this.postGroupsService.publishNow(
      organization,
      user.id,
      id,
    );
    return serializeSingle(req, ReleaseGroupSerializer, data);
  }
}
