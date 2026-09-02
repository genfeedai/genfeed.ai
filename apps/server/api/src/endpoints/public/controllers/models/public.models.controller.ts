import { ModelsService } from '@api/collections/models/services/models.service';
import { PublicModelsQueryDto } from '@api/endpoints/public/dto/public-models-query.dto';
import { Cache } from '@api/helpers/decorators/cache/cache.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { customLabels } from '@api/helpers/utils/pagination.util';
import { QueryDefaultsUtil } from '@api/helpers/utils/query-defaults/query-defaults.util';
import { serializeCollection } from '@api/helpers/utils/response/response.util';
import type { JsonApiCollectionResponse } from '@genfeedai/interfaces';
import { ModelCatalogSerializer } from '@genfeedai/serializers';
import { Public } from '@libs/decorators/public.decorator';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { Controller, Get, Query, Req } from '@nestjs/common';
import type { Request as ExpressRequest } from 'express';

@AutoSwagger()
@Public()
@Controller('public/models')
export class PublicModelsController {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly modelsService: ModelsService,
    private readonly logger: LoggerService,
  ) {}

  /**
   * Public model catalog (#2422) — the registry rows the hub and marketing
   * surfaces are allowed to render, with no authentication.
   *
   * The visibility gate is owned by `ModelsService.findPublicCatalog`, never
   * by the caller:
   * - `isPublic` — the operator flag that opts a row into this surface
   * - `isActive` — excludes discovery drafts, which land inactive and stay
   *   inactive until an operator approves them
   * - `isLegacy` — retired keys stay out of the catalog even while their rows
   *   remain for historical generations
   * - `organizationId: null` — platform models only; org-private rows
   *   (customer trainings, BYO models) never leak
   *
   * The service also projects only the serializer allowlist and the private
   * inputs required to calculate the public credit price. Internal registry
   * columns are neither selected nor returned.
   */
  @Get()
  @Cache({
    keyGenerator: (req) =>
      `public:models:${req.query.category ?? 'all'}:${req.query.provider ?? 'all'}:${req.query.page ?? 1}:${req.query.limit ?? 50}`,
    tags: ['models', 'public'],
    ttl: 3600, // 1 hour — the catalog changes on seed/approval, not per request
  })
  async findPublicModels(
    @Req() request: ExpressRequest,
    @Query() query: PublicModelsQueryDto,
  ): Promise<JsonApiCollectionResponse> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.logger.log(url, { query });

    const options = {
      customLabels,
      ...QueryDefaultsUtil.getPaginationDefaults(query),
    };
    const filters = {
      ...(query.category ? { category: query.category } : {}),
      ...(query.provider ? { provider: query.provider } : {}),
    };
    const data = await this.modelsService.findPublicCatalog(filters, options);

    return serializeCollection(request, ModelCatalogSerializer, data);
  }
}
