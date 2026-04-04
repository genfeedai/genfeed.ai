import { AdminAnnouncementsService } from '@api/endpoints/admin/announcements/announcements.service';
import { BroadcastAnnouncementDto } from '@api/endpoints/admin/announcements/dto/broadcast-announcement.dto';
import { IpWhitelistGuard } from '@api/endpoints/admin/guards/ip-whitelist.guard';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { getPublicMetadata } from '@api/helpers/utils/clerk/clerk.util';
import { ErrorResponse } from '@api/helpers/utils/error-response/error-response.util';
import {
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import type { User } from '@clerk/backend';
import { AnnouncementSerializer } from '@genfeedai/serializers';
import { LoggerService } from '@libs/logger/logger.service';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

@ApiTags('Admin / Announcements')
@Controller('admin/announcements')
@UseGuards(IpWhitelistGuard)
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
      const { organization } = getPublicMetadata(user);
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
  async getHistory(@Req() request: Request) {
    try {
      const announcements = await this.adminAnnouncementsService.getHistory();
      return serializeCollection(request, AnnouncementSerializer, {
        docs: announcements,
        hasNextPage: false,
        hasPrevPage: false,
        limit: announcements.length,
        nextPage: null,
        page: 1,
        pagingCounter: 1,
        prevPage: null,
        totalDocs: announcements.length,
        totalPages: 1,
      });
    } catch (error) {
      return ErrorResponse.handle(error, this.loggerService, 'getHistory');
    }
  }
}
