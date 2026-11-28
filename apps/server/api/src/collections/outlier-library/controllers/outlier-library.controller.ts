import { OutlierLibraryQueryDto } from '@api/collections/outlier-library/dto/outlier-library-query.dto';
import { OutlierLibraryService } from '@api/collections/outlier-library/services/outlier-library.service';
import { OrganizationModule } from '@api/common/organization-modules/organization-module.decorator';
import { ApiKeyReadAccess } from '@api/helpers/decorators/scopes/api-key-read-access.decorator';
import { TenantReadPolicy } from '@api/helpers/interceptors/tenant-context/tenant-read-policy.decorator';
import { serializeCollection } from '@api/helpers/utils/response/response.util';
import { OutlierLibraryPostSerializer } from '@genfeedai/serializers';
import { Controller, Get, Query, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

/**
 * The outlier library (#11643): public posts that far outperformed their
 * creator's typical post. The list is the same for every organization, so
 * there is no tenant filter; the platform tables carry no organization column.
 */
@ApiTags('Outlier library')
@OrganizationModule('discovery')
@Controller('outlier-library')
export class OutlierLibraryController {
  constructor(private readonly library: OutlierLibraryService) {}

  @TenantReadPolicy('selected')
  @ApiKeyReadAccess()
  @Get()
  async list(@Req() request: Request, @Query() query: OutlierLibraryQueryDto) {
    return serializeCollection(
      request,
      OutlierLibraryPostSerializer,
      await this.library.listOutlierPage(query),
    );
  }
}
