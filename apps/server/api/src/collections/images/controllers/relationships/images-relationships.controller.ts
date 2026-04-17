/**
 * Images Relationships Controller
 * Handles image relationship operations:
 * - Get image children (derived images)
 */
import { ImagesQueryDto } from '@api/collections/images/dto/images-query.dto';
import { ImagesService } from '@api/collections/images/services/images.service';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { customLabels } from '@api/helpers/utils/pagination/pagination.util';
import { QueryDefaultsUtil } from '@api/helpers/utils/query-defaults/query-defaults.util';
import { serializeCollection } from '@api/helpers/utils/response/response.util';
import { handleQuerySort } from '@api/helpers/utils/sort/sort.util';
import type { JsonApiCollectionResponse } from '@genfeedai/interfaces';
import { ImageSerializer } from '@genfeedai/serializers';
import { Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';

@AutoSwagger()
@Controller('images')
@UseGuards(RolesGuard)
export class ImagesRelationshipsController {
  constructor(private readonly imagesService: ImagesService) {}

  @Get(':imageId/children')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async findChildren(
    @Req() request: Request,
    @Param('imageId') imageId: string,
    @Query() query: ImagesQueryDto,
  ): Promise<JsonApiCollectionResponse> {
    const options = {
      customLabels,
      ...QueryDefaultsUtil.getPaginationDefaults(query),
    };

    const isDeleted = QueryDefaultsUtil.getIsDeletedDefault(query.isDeleted);
    const aggregate: Record<string, unknown>[] = [
      {
        $match: {
          isDeleted,
          parent: imageId,
        },
      },
      {
        $sort: handleQuerySort(query.sort),
      },
    ];

    const data = await this.imagesService.findAll(aggregate, options);
    return serializeCollection(request, ImageSerializer, data);
  }
}
