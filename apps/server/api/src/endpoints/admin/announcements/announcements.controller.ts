import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { SuperAdminGuard } from '@api/common/guards/super-admin.guard';
import { AdminAnnouncementsService } from '@api/endpoints/admin/announcements/announcements.service';
import { BroadcastAnnouncementDto } from '@api/endpoints/admin/announcements/dto/broadcast-announcement.dto';
import { IpWhitelistGuard } from '@api/endpoints/admin/guards/ip-whitelist.guard';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import {
  PaginationQueryDto,
  resolvePageWindow,
} from '@api/helpers/dto/pagination-query.dto';
import { ErrorResponse } from '@api/helpers/utils/error-response/error-response.util';
import {
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import { AnnouncementSerializer } from '@genfeedai/serializers';
import { LoggerService } from '@libs/logger/logger.service';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

@ApiTags('Admin / Announcements')
@Controller('admin/announcements')
@UseGuards(IpWhitelistGuard, SuperAdminGuard)
export class AnnouncementsController {
  constructor(
    private readonly adminAnnouncementsService: AdminAnnouncementsService,
    private readonly loggerService: LoggerService,
  ) {}

  @Post('broadcast')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Broadcast an announcement to Discord and/or Twitter',
  })
  async broadcast(
    @Body() dto: BroadcastAnnouncementDto,
    @CurrentUser() user: User,
    @Req() request: Request,
  ) {
    try {
      const organization = user.organizationId;
      const announcement = await this.adminAnnouncementsService.broadcast(
        user.id,
        organization,
        dto,
      );
      return serializeSingle(request, AnnouncementSerializer, announcement);
    } catch (error) {
      return ErrorResponse.handle(error, this.loggerService, 'broadcast');
    }
  }

  @Get()
  @ApiOperation({ summary: 'Get announcement broadcast history' })
  async getHistory(
    @Query() query: PaginationQueryDto,
    @Req() request: Request,
  ) {
    try {
      const announcements = await this.adminAnnouncementsService.getHistory(
        resolvePageWindow(query),
      );
      return serializeCollection(
        request,
        AnnouncementSerializer,
        announcements,
      );
    } catch (error) {
      return ErrorResponse.handle(error, this.loggerService, 'getHistory');
    }
  }
}
