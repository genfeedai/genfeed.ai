import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import { CreateKnowledgeSpaceDto } from '@api/collections/contexts/dto/create-knowledge-space.dto';
import { KnowledgeListDto } from '@api/collections/contexts/dto/knowledge-list.dto';
import { KnowledgeScopeDto } from '@api/collections/contexts/dto/knowledge-scope.dto';
import { KnowledgeRecordsService } from '@api/collections/contexts/services/knowledge-records.service';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import {
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import {
  KnowledgeSpaceMembershipSerializer,
  KnowledgeSpaceSerializer,
} from '@genfeedai/serializers';
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import type { Request } from 'express';

@AutoSwagger()
@ApiBearerAuth()
@Controller('knowledge-spaces')
export class KnowledgeSpacesController {
  constructor(private readonly records: KnowledgeRecordsService) {}

  @Post()
  async create(
    @Req() request: Request,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateKnowledgeSpaceDto,
  ) {
    return serializeSingle(
      request,
      KnowledgeSpaceSerializer,
      await this.records.createSpace(user, dto),
    );
  }

  @Post('inbox')
  async inbox(
    @Req() request: Request,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: KnowledgeScopeDto,
  ) {
    return serializeSingle(
      request,
      KnowledgeSpaceSerializer,
      await this.records.ensureInbox(user, dto.scope),
    );
  }

  @Get()
  async list(
    @Req() request: Request,
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: KnowledgeListDto,
  ) {
    return serializeCollection(
      request,
      KnowledgeSpaceSerializer,
      await this.records.listSpaces(user, query.page, query.limit),
    );
  }

  @Get(':spaceId')
  async find(
    @Req() request: Request,
    @CurrentUser() user: AuthenticatedUser,
    @Param('spaceId') id: string,
  ) {
    return serializeSingle(
      request,
      KnowledgeSpaceSerializer,
      await this.records.getSpace(user, id),
    );
  }

  @Delete(':spaceId')
  async remove(
    @Req() request: Request,
    @CurrentUser() user: AuthenticatedUser,
    @Param('spaceId') id: string,
  ) {
    return serializeSingle(
      request,
      KnowledgeSpaceSerializer,
      await this.records.deleteSpace(user, id),
    );
  }

  @Get(':spaceId/memberships')
  async memberships(
    @Req() request: Request,
    @CurrentUser() user: AuthenticatedUser,
    @Param('spaceId') id: string,
  ) {
    return serializeCollection(request, KnowledgeSpaceMembershipSerializer, {
      docs: await this.records.listMemberships(user, id),
    });
  }

  @Put(':spaceId/memberships/:sourceId')
  async add(
    @Req() request: Request,
    @CurrentUser() user: AuthenticatedUser,
    @Param('spaceId') spaceId: string,
    @Param('sourceId') sourceId: string,
  ) {
    return serializeSingle(
      request,
      KnowledgeSpaceMembershipSerializer,
      await this.records.setMembership(user, sourceId, spaceId, false),
    );
  }

  @Delete(':spaceId/memberships/:sourceId')
  async removeMembership(
    @Req() request: Request,
    @CurrentUser() user: AuthenticatedUser,
    @Param('spaceId') spaceId: string,
    @Param('sourceId') sourceId: string,
  ) {
    return serializeSingle(
      request,
      KnowledgeSpaceMembershipSerializer,
      await this.records.setMembership(user, sourceId, spaceId, true),
    );
  }
}
