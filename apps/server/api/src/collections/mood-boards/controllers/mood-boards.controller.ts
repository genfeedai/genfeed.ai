import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { UpdateMoodBoardDto } from '@api/collections/mood-boards/dto/update-mood-board.dto';
import { MoodBoardsService } from '@api/collections/mood-boards/services/mood-boards.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import {
  returnNotFound,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import { scopedWhere } from '@api/index';
import type { JsonApiSingleResponse } from '@genfeedai/contracts/interfaces';
import { MoodBoardSerializer } from '@genfeedai/serializers';
import { LoggerService } from '@libs/logger/logger.service';
import {
  Body,
  Controller,
  Get,
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
    @CurrentUser() user: User,
    @Query('brand') brandId: string,
  ): Promise<JsonApiSingleResponse> {
    if (!brandId) {
      throw new NotFoundException({
        message: 'Query param `brand` is required',
      });
    }

    const organizationId = user.organizationId;

    const data = await this.service.findOrCreateByBrand(
      brandId,
      organizationId,
    );
    return serializeSingle(request, MoodBoardSerializer, data);
  }

  @Patch(':id')
  async update(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() dto: UpdateMoodBoardDto,
  ): Promise<JsonApiSingleResponse> {
    const organizationId = user.organizationId;

    const existing = await this.service.findOne(
      scopedWhere(organizationId, { id }),
    );

    if (!existing) {
      return returnNotFound(this.constructorName, id);
    }

    const data = await this.service.patch(id, dto);
    return data
      ? serializeSingle(request, MoodBoardSerializer, data)
      : returnNotFound(this.constructorName, id);
  }
}
