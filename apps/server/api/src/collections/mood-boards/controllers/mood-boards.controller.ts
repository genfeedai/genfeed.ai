import type { UpdateMoodBoardDto } from '@api/collections/mood-boards/dto/update-mood-board.dto';
import { MoodBoardsService } from '@api/collections/mood-boards/services/mood-boards.service';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import {
  returnNotFound,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import type { JsonApiSingleResponse } from '@genfeedai/interfaces';
import { MoodBoardSerializer } from '@genfeedai/serializers';
import { LoggerService } from '@libs/logger/logger.service';
import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Patch,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';

@AutoSwagger()
@Controller('mood-boards')
export class MoodBoardsController {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    readonly logger: LoggerService,
    readonly service: MoodBoardsService,
  ) {}

  @Get()
  async findByBrand(
    @Req() request: Request,
    @Query('brand') brandId: string,
  ): Promise<JsonApiSingleResponse> {
    if (!brandId) {
      throw new NotFoundException('Query param `brand` is required');
    }

    const data = await this.service.findOrCreateByBrand(brandId);
    return serializeSingle(request, MoodBoardSerializer, data);
  }

  @Patch(':id')
  async update(
    @Req() request: Request,
    @Param('id') id: string,
    @Body() dto: UpdateMoodBoardDto,
  ): Promise<JsonApiSingleResponse> {
    const existing = await this.service.findOne({ id, isDeleted: false });

    if (!existing) {
      return returnNotFound(this.constructorName, id);
    }

    const data = await this.service.patch(id, dto);
    return data
      ? serializeSingle(request, MoodBoardSerializer, data)
      : returnNotFound(this.constructorName, id);
  }
}
