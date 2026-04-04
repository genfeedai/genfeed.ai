import { ContentSchedulesQueryDto } from '@api/collections/content-schedules/dto/content-schedules-query.dto';
import { CreateContentScheduleDto } from '@api/collections/content-schedules/dto/create-content-schedule.dto';
import { UpdateContentScheduleDto } from '@api/collections/content-schedules/dto/update-content-schedule.dto';
import { ContentSchedulesService } from '@api/collections/content-schedules/services/content-schedules.service';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { getPublicMetadata } from '@api/helpers/utils/clerk/clerk.util';
import {
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import type { User } from '@clerk/backend';
import { ContentScheduleSerializer } from '@genfeedai/serializers';
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

@ApiTags('ContentSchedules')
@Controller('brands/:brandId/schedules')
export class ContentSchedulesController {
  constructor(
    private readonly contentSchedulesService: ContentSchedulesService,
  ) {}

  @Get()
  async list(
    @Req() req: Request,
    @CurrentUser() user: User,
    @Param('brandId') brandId: string,
    @Query() query: ContentSchedulesQueryDto,
  ) {
    const { organization } = getPublicMetadata(user);
    const docs = await this.contentSchedulesService.listByBrand(
      organization,
      brandId,
      query.isEnabled,
    );
    return serializeCollection(req, ContentScheduleSerializer, { docs });
  }

  @Get(':id')
  async getOne(
    @Req() req: Request,
    @CurrentUser() user: User,
    @Param('brandId') brandId: string,
    @Param('id') id: string,
  ) {
    const { organization } = getPublicMetadata(user);
    const data = await this.contentSchedulesService.getById(
      organization,
      brandId,
      id,
    );
    return serializeSingle(req, ContentScheduleSerializer, data);
  }

  @Post()
  async create(
    @Req() req: Request,
    @CurrentUser() user: User,
    @Param('brandId') brandId: string,
    @Body() dto: CreateContentScheduleDto,
  ) {
    const { organization } = getPublicMetadata(user);
    const data = await this.contentSchedulesService.createForBrand(
      organization,
      brandId,
      dto,
    );
    return serializeSingle(req, ContentScheduleSerializer, data);
  }

  @Patch(':id')
  async update(
    @Req() req: Request,
    @CurrentUser() user: User,
    @Param('brandId') brandId: string,
    @Param('id') id: string,
    @Body() dto: UpdateContentScheduleDto,
  ) {
    const { organization } = getPublicMetadata(user);
    const data = await this.contentSchedulesService.updateForBrand(
      organization,
      brandId,
      id,
      dto,
    );
    return serializeSingle(req, ContentScheduleSerializer, data);
  }

  @Delete(':id')
  async remove(
    @Req() req: Request,
    @CurrentUser() user: User,
    @Param('brandId') brandId: string,
    @Param('id') id: string,
  ) {
    const { organization } = getPublicMetadata(user);
    const data = await this.contentSchedulesService.removeForBrand(
      organization,
      brandId,
      id,
    );
    return serializeSingle(req, ContentScheduleSerializer, data);
  }
}
