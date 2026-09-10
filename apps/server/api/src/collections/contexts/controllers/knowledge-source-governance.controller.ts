import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import {
  KnowledgeLegalHoldDto,
  KnowledgePurgeScheduleDto,
} from '@api/collections/contexts/dto/knowledge-lifecycle.dto';
import { KnowledgeRecordsService } from '@api/collections/contexts/services/knowledge-records.service';
import { resolveKnowledgeActor } from '@api/collections/contexts/utils/knowledge-actor.util';
import { RolesDecorator } from '@api/helpers/decorators/roles/roles.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { serializeSingle } from '@api/helpers/utils/response/response.util';
import { MemberRole } from '@genfeedai/contracts';
import { KnowledgeSourceVersionSerializer } from '@genfeedai/serializers';
import {
  Body,
  Controller,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import type { Request } from 'express';

const BRAND_ID_QUERY = {
  description:
    'Selected brand in the authenticated organization; omit for organization scope',
  name: 'brandId',
  required: false,
  type: String,
} as const;

@AutoSwagger()
@ApiBearerAuth()
@Controller('knowledge-sources')
export class KnowledgeSourceGovernanceController {
  constructor(private readonly records: KnowledgeRecordsService) {}

  @Post(':sourceId/versions/:versionId/schedule-purge')
  @UseGuards(RolesGuard)
  @RolesDecorator(MemberRole.OWNER, MemberRole.ADMIN)
  @ApiQuery(BRAND_ID_QUERY)
  async schedule(
    @Req() request: Request,
    @CurrentUser() user: AuthenticatedUser,
    @Param('sourceId') sourceId: string,
    @Param('versionId') id: string,
    @Body() dto: KnowledgePurgeScheduleDto,
    @Query('brandId') brandId?: string,
  ) {
    return serializeSingle(
      request,
      KnowledgeSourceVersionSerializer,
      await this.records.schedulePurge(
        resolveKnowledgeActor(user, brandId),
        sourceId,
        id,
        dto.purgeScheduledAt,
      ),
    );
  }

  @Post(':sourceId/versions/:versionId/purge')
  @UseGuards(RolesGuard)
  @RolesDecorator(MemberRole.OWNER, MemberRole.ADMIN)
  @ApiQuery(BRAND_ID_QUERY)
  async purge(
    @Req() request: Request,
    @CurrentUser() user: AuthenticatedUser,
    @Param('sourceId') sourceId: string,
    @Param('versionId') id: string,
    @Query('brandId') brandId?: string,
  ) {
    return serializeSingle(
      request,
      KnowledgeSourceVersionSerializer,
      await this.records.purgeVersion(
        resolveKnowledgeActor(user, brandId),
        sourceId,
        id,
      ),
    );
  }

  @Post(':sourceId/versions/:versionId/legal-hold')
  @UseGuards(RolesGuard)
  @RolesDecorator(MemberRole.OWNER, MemberRole.ADMIN)
  @ApiQuery(BRAND_ID_QUERY)
  async legalHold(
    @Req() request: Request,
    @CurrentUser() user: AuthenticatedUser,
    @Param('sourceId') sourceId: string,
    @Param('versionId') id: string,
    @Body() dto: KnowledgeLegalHoldDto,
    @Query('brandId') brandId?: string,
  ) {
    return serializeSingle(
      request,
      KnowledgeSourceVersionSerializer,
      await this.records.setLegalHold(
        resolveKnowledgeActor(user, brandId),
        sourceId,
        id,
        dto.isLegalHold,
      ),
    );
  }

  @Post(':sourceId/versions/:versionId/erase')
  @UseGuards(RolesGuard)
  @RolesDecorator(MemberRole.OWNER, MemberRole.ADMIN)
  @ApiQuery(BRAND_ID_QUERY)
  async erase(
    @Req() request: Request,
    @CurrentUser() user: AuthenticatedUser,
    @Param('sourceId') sourceId: string,
    @Param('versionId') id: string,
    @Query('brandId') brandId?: string,
  ) {
    return serializeSingle(
      request,
      KnowledgeSourceVersionSerializer,
      await this.records.eraseVersion(
        resolveKnowledgeActor(user, brandId),
        sourceId,
        id,
      ),
    );
  }
}
