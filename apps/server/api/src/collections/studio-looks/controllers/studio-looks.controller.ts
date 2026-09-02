import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { CreateStudioLookDto } from '@api/collections/studio-looks/dto/create-studio-look.dto';
import { StudioLooksQueryDto } from '@api/collections/studio-looks/dto/studio-looks-query.dto';
import { UpdateStudioLookDto } from '@api/collections/studio-looks/dto/update-studio-look.dto';
import {
  type StudioLookRequestScope,
  StudioLooksService,
} from '@api/collections/studio-looks/services/studio-looks.service';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { customLabels } from '@api/helpers/utils/pagination.util';
import { QueryDefaultsUtil } from '@api/helpers/utils/query-defaults/query-defaults.util';
import {
  returnNotFound,
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import type {
  JsonApiCollectionResponse,
  JsonApiSingleResponse,
} from '@genfeedai/contracts/interfaces';
import { StudioLookSerializer } from '@genfeedai/serializers';
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import type { Request } from 'express';

@AutoSwagger()
@ApiBearerAuth()
@Controller('studio-looks')
export class StudioLooksController {
  private readonly constructorName = String(this.constructor.name);

  constructor(private readonly studioLooksService: StudioLooksService) {}

  @Get()
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async findAll(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Query() query: StudioLooksQueryDto,
  ): Promise<JsonApiCollectionResponse> {
    const data = await this.studioLooksService.listScoped(
      this.getScope(user),
      query.assetType,
      {
        customLabels,
        ...QueryDefaultsUtil.getPaginationDefaults(query),
      },
    );

    return serializeCollection(request, StudioLookSerializer, data);
  }

  @Post()
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async create(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Body() dto: CreateStudioLookDto,
  ): Promise<JsonApiSingleResponse> {
    const look = await this.studioLooksService.createScoped(
      dto,
      this.getScope(user),
    );

    return serializeSingle(request, StudioLookSerializer, look);
  }

  @Patch(':id')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async update(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() dto: UpdateStudioLookDto,
  ): Promise<JsonApiSingleResponse> {
    const look = await this.studioLooksService.updateScoped(
      id,
      dto,
      this.getScope(user),
    );
    if (!look) {
      return returnNotFound(this.constructorName, id);
    }

    return serializeSingle(request, StudioLookSerializer, look);
  }

  @Delete(':id')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async remove(
    @CurrentUser() user: User,
    @Param('id') id: string,
  ): Promise<JsonApiSingleResponse<{ message: string }>> {
    const removed = await this.studioLooksService.removeScoped(
      id,
      this.getScope(user),
    );
    if (!removed) {
      return returnNotFound(this.constructorName, id);
    }

    return {
      data: {
        attributes: { message: 'Studio Look deleted successfully' },
        id,
        type: 'studio-look',
      },
    };
  }

  private getScope(user: User): StudioLookRequestScope {
    const organizationId = user.organizationId?.trim();
    const brandId = user.brandId?.trim();
    const userId = (user.userId ?? user.id)?.trim();

    if (!organizationId || !userId) {
      throw new UnauthorizedException('Authenticated workspace is required');
    }
    if (!brandId) {
      throw new BadRequestException('An active brand is required');
    }

    return { brandId, organizationId, userId };
  }
}
