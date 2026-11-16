import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { ModelsQueryDto } from '@api/collections/models/dto/models-query.dto';
import { ModelsService } from '@api/collections/models/services/models.service';
import type { RequestWithContext } from '@api/common/middleware/request-context.middleware';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { CollectionFilterUtil } from '@api/helpers/utils/collection-filter/collection-filter.util';
import { customLabels } from '@api/helpers/utils/pagination.util';
import { serializeCollection } from '@api/helpers/utils/response/response.util';
import { ModelLifecycle } from '@genfeedai/contracts';
import type { JsonApiCollectionResponse } from '@genfeedai/contracts/interfaces';
import { ModelSerializer } from '@genfeedai/serializers';
import { Controller, Get, Query, Req } from '@nestjs/common';

/**
 * The retired catalog rows, readable by every member. The catalog list hides
 * them from non-admins, so a saved workflow step or default that still points
 * at one uses this to show a retired flag and the model's name.
 *
 * Registered before ModelsController so `models/retired` is not read as a
 * model id.
 */
@AutoSwagger()
@Controller('models')
export class RetiredModelsController {
  constructor(private readonly modelsService: ModelsService) {}

  @Get('retired')
  async findRetired(
    @Req() request: RequestWithContext,
    @CurrentUser() user: User,
    @Query() query: ModelsQueryDto,
  ): Promise<JsonApiCollectionResponse> {
    const tenant = CollectionFilterUtil.resolveListOrganizationId(
      query,
      user,
      request,
    );
    const data = await this.modelsService.findAll(
      {
        where: {
          isDeleted: false,
          isProviderVariant: false,
          lifecycle: ModelLifecycle.RETIRED,
          OR: [
            { organizationId: null },
            ...(tenant.organizationId
              ? [{ organizationId: tenant.organizationId }]
              : []),
          ],
        },
      },
      { customLabels, pagination: false },
    );
    return serializeCollection(request, ModelSerializer, data);
  }
}
