import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import { CreateKnowledgeSpaceDto } from '@api/collections/contexts/dto/create-knowledge-space.dto';
import { KnowledgeListDto } from '@api/collections/contexts/dto/knowledge-list.dto';
import { KnowledgeScopeDto } from '@api/collections/contexts/dto/knowledge-scope.dto';
import { UpdateKnowledgeSpaceDto } from '@api/collections/contexts/dto/update-knowledge-space.dto';
import { KnowledgeRecordsService } from '@api/collections/contexts/services/knowledge-records.service';
import { resolveKnowledgeActor } from '@api/collections/contexts/utils/knowledge-actor.util';
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
  Patch,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import type { Request } from 'express';

@AutoSwagger()
@ApiBearerAuth()
@Controller('knowledge-spaces')
export class KnowledgeSpacesController {
  constructor(private readonly records: KnowledgeRecordsService) {}

  @Post()
  @ApiQuery({
    name: 'brandId',
    required: false,
    type: String,
    description:
      'Selected brand in the authenticated organization; omit for organization scope',
  })
  async create(
    @Req() request: Request,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateKnowledgeSpaceDto,
    @Query('brandId') brandId?: string,
  ) {
    return serializeSingle(
      request,
      KnowledgeSpaceSerializer,
      await this.records.createSpace(resolveKnowledgeActor(user, brandId), dto),
    );
  }

  @Post('inbox')
  @ApiQuery({
    name: 'brandId',
    required: false,
    type: String,
    description:
      'Selected brand in the authenticated organization; omit for organization scope',
  })
  async inbox(
    @Req() request: Request,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: KnowledgeScopeDto,
    @Query('brandId') brandId?: string,
  ) {
    return serializeSingle(
      request,
      KnowledgeSpaceSerializer,
      await this.records.ensureInbox(
        resolveKnowledgeActor(user, brandId),
        dto.scope,
      ),
    );
  }

  @Get()
  @ApiQuery({
    name: 'brandId',
    required: false,
    type: String,
    description:
      'Selected brand in the authenticated organization; omit for organization scope',
  })
  async list(
    @Req() request: Request,
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: KnowledgeListDto,
    @Query('brandId') brandId?: string,
  ) {
    return serializeCollection(
      request,
      KnowledgeSpaceSerializer,
      await this.records.listSpaces(
        resolveKnowledgeActor(user, brandId),
        query.page,
        query.limit,
      ),
    );
  }

  @Get(':spaceId')
  @ApiQuery({
    name: 'brandId',
    required: false,
    type: String,
    description:
      'Selected brand in the authenticated organization; omit for organization scope',
  })
  async find(
    @Req() request: Request,
    @CurrentUser() user: AuthenticatedUser,
    @Param('spaceId') id: string,
    @Query('brandId') brandId?: string,
  ) {
    return serializeSingle(
      request,
      KnowledgeSpaceSerializer,
      await this.records.getSpace(resolveKnowledgeActor(user, brandId), id),
    );
  }

  @Patch(':spaceId')
  @ApiQuery({
    name: 'brandId',
    required: false,
    type: String,
    description:
      'Selected brand in the authenticated organization; omit for organization scope',
  })
  async update(
    @Req() request: Request,
    @CurrentUser() user: AuthenticatedUser,
    @Param('spaceId') id: string,
    @Body() dto: UpdateKnowledgeSpaceDto,
    @Query('brandId') brandId?: string,
  ) {
    return serializeSingle(
      request,
      KnowledgeSpaceSerializer,
      await this.records.updateSpace(
        resolveKnowledgeActor(user, brandId),
        id,
        dto.title,
      ),
    );
  }

  @Delete(':spaceId')
  @ApiQuery({
    name: 'brandId',
    required: false,
    type: String,
    description:
      'Selected brand in the authenticated organization; omit for organization scope',
  })
  async remove(
    @Req() request: Request,
    @CurrentUser() user: AuthenticatedUser,
    @Param('spaceId') id: string,
    @Query('brandId') brandId?: string,
  ) {
    return serializeSingle(
      request,
      KnowledgeSpaceSerializer,
      await this.records.deleteSpace(resolveKnowledgeActor(user, brandId), id),
    );
  }

  @Get(':spaceId/memberships')
  @ApiQuery({
    name: 'brandId',
    required: false,
    type: String,
    description:
      'Selected brand in the authenticated organization; omit for organization scope',
  })
  async memberships(
    @Req() request: Request,
    @CurrentUser() user: AuthenticatedUser,
    @Param('spaceId') id: string,
    @Query('brandId') brandId?: string,
  ) {
    return serializeCollection(request, KnowledgeSpaceMembershipSerializer, {
      docs: await this.records.listMemberships(
        resolveKnowledgeActor(user, brandId),
        id,
      ),
    });
  }

  @Put(':spaceId/memberships/:sourceId')
  @ApiQuery({
    name: 'brandId',
    required: false,
    type: String,
    description:
      'Selected brand in the authenticated organization; omit for organization scope',
  })
  async add(
    @Req() request: Request,
    @CurrentUser() user: AuthenticatedUser,
    @Param('spaceId') spaceId: string,
    @Param('sourceId') sourceId: string,
    @Query('brandId') brandId?: string,
  ) {
    return serializeSingle(
      request,
      KnowledgeSpaceMembershipSerializer,
      await this.records.setMembership(
        resolveKnowledgeActor(user, brandId),
        sourceId,
        spaceId,
        false,
      ),
    );
  }

  @Delete(':spaceId/memberships/:sourceId')
  @ApiQuery({
    name: 'brandId',
    required: false,
    type: String,
    description:
      'Selected brand in the authenticated organization; omit for organization scope',
  })
  async removeMembership(
    @Req() request: Request,
    @CurrentUser() user: AuthenticatedUser,
    @Param('spaceId') spaceId: string,
    @Param('sourceId') sourceId: string,
    @Query('brandId') brandId?: string,
  ) {
    return serializeSingle(
      request,
      KnowledgeSpaceMembershipSerializer,
      await this.records.setMembership(
        resolveKnowledgeActor(user, brandId),
        sourceId,
        spaceId,
        true,
      ),
    );
  }
}
