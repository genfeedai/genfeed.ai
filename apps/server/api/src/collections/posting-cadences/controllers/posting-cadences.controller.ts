import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import {
  BookCalendarSlotDto,
  FillCalendarSlotDto,
} from '@api/collections/posting-cadences/dto/calendar-slot-action.dto';
import { CalendarSlotQueryDto } from '@api/collections/posting-cadences/dto/calendar-slot-query.dto';
import { CreatePostingCadenceDto } from '@api/collections/posting-cadences/dto/create-posting-cadence.dto';
import { PostingCadencesService } from '@api/collections/posting-cadences/services/posting-cadences.service';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import {
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import {
  CalendarSlotSerializer,
  PostingCadenceSerializer,
} from '@genfeedai/serializers';
import { Body, Controller, Get, Post, Query, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

@AutoSwagger()
@ApiTags('PostingCadences')
@Controller('posting-cadences')
export class PostingCadencesController {
  constructor(private readonly service: PostingCadencesService) {}

  @Post()
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
  async book(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Body() dto: BookCalendarSlotDto,
  ) {
    const data = await this.service.book(user.organizationId, dto);
    return serializeSingle(request, CalendarSlotSerializer, data);
  }

  @Post('slots/generate')
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
    );
    return serializeSingle(request, CalendarSlotSerializer, {
      ...data.slot,
      generatedItemId: data.targetId,
    });
  }

  @Post('slots/write')
  async write(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Body() dto: FillCalendarSlotDto,
  ) {
    const data = await this.service.write(
      user.organizationId,
      user.id,
      dto.identityKey,
    );
    return serializeSingle(request, CalendarSlotSerializer, {
      ...data.slot,
      generatedItemId: data.targetId,
    });
  }
}
