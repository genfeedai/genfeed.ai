import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import {
  BookCalendarSlotDto,
  BulkGenerateCalendarSlotsDto,
  CancelCalendarSlotDto,
  FillCalendarSlotDto,
  SkipCalendarSlotDto,
} from '@api/collections/posting-cadences/dto/calendar-slot-action.dto';
import { CalendarSlotQueryDto } from '@api/collections/posting-cadences/dto/calendar-slot-query.dto';
import { CreatePostingCadenceDto } from '@api/collections/posting-cadences/dto/create-posting-cadence.dto';
import { UpdatePostingCadenceDto } from '@api/collections/posting-cadences/dto/update-posting-cadence.dto';
import { PostingCadencesService } from '@api/collections/posting-cadences/services/posting-cadences.service';
import { RequiredScopes } from '@api/helpers/decorators/scopes/required-scopes.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { API_KEY_POSTING_CONFIGURATION_SCOPES } from '@api/helpers/utils/auth/api-key-publishing-scope.util';
import {
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import {
  CalendarSlotBulkGenerateSerializer,
  CalendarSlotSerializer,
  PostingCadenceSerializer,
} from '@genfeedai/serializers';
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

@AutoSwagger()
@ApiTags('PostingCadences')
@Controller('posting-cadences')
export class PostingCadencesController {
  constructor(private readonly service: PostingCadencesService) {}

  @Post()
  @RequiredScopes(...API_KEY_POSTING_CONFIGURATION_SCOPES)
  async create(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Body() dto: CreatePostingCadenceDto,
  ) {
    const data = await this.service.create(user.organizationId, user.id, dto);
    return serializeSingle(request, PostingCadenceSerializer, data);
  }

  @Get()
  async list(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Query('brandId') brandId: string,
  ) {
    if (!brandId) {
      return serializeCollection(request, PostingCadenceSerializer, {
        docs: [],
      });
    }
    const data = await this.service.list(user.organizationId, brandId);
    return serializeCollection(request, PostingCadenceSerializer, {
      docs: data,
    });
  }

  @Get('slots')
  async listSlots(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Query() query: CalendarSlotQueryDto,
  ) {
    const data = await this.service.listSlots(
      user.organizationId,
      query.brandId,
      query.startDate,
      query.endDate,
    );
    return serializeCollection(request, CalendarSlotSerializer, {
      docs: data,
    });
  }

  @Post('slots/book')
  @RequiredScopes(...API_KEY_POSTING_CONFIGURATION_SCOPES)
  async book(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Body() dto: BookCalendarSlotDto,
  ) {
    const data = await this.service.book(user.organizationId, dto);
    return serializeSingle(request, CalendarSlotSerializer, data);
  }

  @Post('slots/generate')
  @RequiredScopes(...API_KEY_POSTING_CONFIGURATION_SCOPES)
  async generate(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Body() dto: FillCalendarSlotDto,
  ) {
    const data = await this.service.generate(
      user.organizationId,
      user.id,
      dto.identityKey,
      dto.brief,
      user,
    );
    return serializeSingle(request, CalendarSlotSerializer, {
      ...data.slot,
      generatedItemId: data.targetId,
    });
  }

  @Post('slots/generate-bulk')
  @RequiredScopes(...API_KEY_POSTING_CONFIGURATION_SCOPES)
  async generateBulk(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Body() dto: BulkGenerateCalendarSlotsDto,
  ) {
    const abort = new AbortController();
    const onAborted = () => abort.abort();
    request.on('aborted', onAborted);
    try {
      const data = await this.service.generateBulk(
        user.organizationId,
        user.id,
        dto.identityKeys,
        dto.confirmedCount,
        dto.brief,
        user,
        abort.signal,
      );
      return serializeSingle(request, CalendarSlotBulkGenerateSerializer, data);
    } finally {
      request.off('aborted', onAborted);
    }
  }

  @Post('slots/write')
  @RequiredScopes(...API_KEY_POSTING_CONFIGURATION_SCOPES)
  async write(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Body() dto: FillCalendarSlotDto,
  ) {
    const data = await this.service.write(
      user.organizationId,
      user.id,
      dto.identityKey,
      user,
    );
    return serializeSingle(request, CalendarSlotSerializer, {
      ...data.slot,
      generatedItemId: data.targetId,
    });
  }

  @Post('slots/skip')
  @RequiredScopes(...API_KEY_POSTING_CONFIGURATION_SCOPES)
  async skip(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Body() dto: SkipCalendarSlotDto,
  ) {
    const data = await this.service.skip(user.organizationId, dto.identityKey);
    return serializeSingle(request, CalendarSlotSerializer, data);
  }

  @Post('slots/cancel')
  @RequiredScopes(...API_KEY_POSTING_CONFIGURATION_SCOPES)
  async cancel(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Body() dto: CancelCalendarSlotDto,
  ) {
    const data = await this.service.cancel(
      user.organizationId,
      dto.identityKey,
    );
    return serializeSingle(request, CalendarSlotSerializer, data);
  }

  @Patch(':id')
  @RequiredScopes(...API_KEY_POSTING_CONFIGURATION_SCOPES)
  async update(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() dto: UpdatePostingCadenceDto,
  ) {
    const data = await this.service.update(user.organizationId, id, dto);
    return serializeSingle(request, PostingCadenceSerializer, data);
  }

  @Delete(':id')
  @RequiredScopes(...API_KEY_POSTING_CONFIGURATION_SCOPES)
  async remove(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
  ) {
    const data = await this.service.remove(user.organizationId, id);
    return serializeSingle(request, PostingCadenceSerializer, data);
  }
}
