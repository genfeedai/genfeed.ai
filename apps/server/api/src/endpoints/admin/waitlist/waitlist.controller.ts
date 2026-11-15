import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { ListWaitlistQueryDto } from '@api/collections/waitlist/dto/list-waitlist-query.dto';
import { ReviewWaitlistEntryDto } from '@api/collections/waitlist/dto/review-waitlist-entry.dto';
import { WaitlistService } from '@api/collections/waitlist/services/waitlist.service';
import { SuperAdminGuard } from '@api/common/guards/super-admin.guard';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { resolvePageWindow } from '@api/helpers/dto/pagination-query.dto';
import { ErrorResponse } from '@api/helpers/utils/error-response/error-response.util';
import {
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import { WaitlistEntrySerializer } from '@genfeedai/serializers';
import { LoggerService } from '@libs/logger/logger.service';
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

@ApiTags('Admin / Waitlist')
@Controller('admin/waitlist')
// Super-admin only. No IP allowlist: the console drives these routes from the
// operator's browser, whose IP changes, and SuperAdminGuard is the gate.
@UseGuards(SuperAdminGuard)
export class WaitlistController {
  constructor(
    private readonly waitlist: WaitlistService,
    private readonly loggerService: LoggerService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List waitlist entries' })
  async list(@Query() query: ListWaitlistQueryDto, @Req() request: Request) {
    try {
      const entries = await this.waitlist.list({
        ...resolvePageWindow(query),
        search: query.search,
        status: query.status,
      });
      return serializeCollection(request, WaitlistEntrySerializer, entries);
    } catch (error) {
      return ErrorResponse.handle(error, this.loggerService, 'listWaitlist');
    }
  }

  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Approve or reject a waitlist entry',
    description:
      'An approved email may create an account while signup is invite-only.',
  })
  async review(
    @Param('id') id: string,
    @Body() dto: ReviewWaitlistEntryDto,
    @CurrentUser() user: User,
    @Req() request: Request,
  ) {
    try {
      const entry = await this.waitlist.review(
        id,
        this.getActorUserId(user),
        dto,
      );
      return serializeSingle(request, WaitlistEntrySerializer, entry);
    } catch (error) {
      return ErrorResponse.handle(error, this.loggerService, 'reviewWaitlist');
    }
  }

  private getActorUserId(user: User): string {
    const actorUserId = (user.userId ?? user.id)?.toString().trim();

    if (!actorUserId) {
      throw new BadRequestException(
        'Local user id is required for waitlist actions',
      );
    }

    return actorUserId;
  }
}
