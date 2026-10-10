import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { ApiKeysService } from '@api/collections/api-keys/services/api-keys.service';
import { resolveGenerationBrandIdForCaller } from '@api/collections/api-keys/utils/resolve-generation-brand-for-caller.util';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import { GenerateContentDto } from '@api/collections/content-intelligence/dto/generate-content.dto';
import { ContentGeneratorService } from '@api/collections/content-intelligence/services/content-generator.service';
import { MembersService } from '@api/collections/members/services/members.service';
import { OrganizationModule } from '@api/common/organization-modules/organization-module.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { RateLimit } from '@api/shared/decorators/rate-limit/rate-limit.decorator';
import type { JsonApiCollectionResponse } from '@genfeedai/contracts/interfaces';
import { GeneratedContentSerializer } from '@genfeedai/serializers';
import { LoggerService } from '@libs/logger/logger.service';
import { Body, Controller, Post, Req } from '@nestjs/common';
import type { Request } from 'express';

@AutoSwagger()
@Controller('content-intelligence/generate')
@OrganizationModule('playground')
export class GenerateController {
  constructor(
    private readonly contentGeneratorService: ContentGeneratorService,
    private readonly apiKeysService: ApiKeysService,
    private readonly brandsService: BrandsService,
    private readonly membersService: MembersService,
    readonly _logger: LoggerService,
  ) {}

  @Post()
  @RateLimit({ limit: 30, scope: 'organization', windowMs: 60000 })
  async generate(
    @Req() _request: Request,
    @CurrentUser() user: User,
    @Body() dto: GenerateContentDto,
  ): Promise<JsonApiCollectionResponse> {
    const organizationId = user.organizationId;
    const brandId = await this.resolveBrandId(dto, user);

    const results = await this.contentGeneratorService.generateContentWorkflow(
      user.userId ?? user.id,
      organizationId,
      { ...dto, brandId },
    );

    return GeneratedContentSerializer.serializeCollection(results);
  }

  /**
   * Generation always has an explicit brand (#5219), resolved through the
   * single API-key/MCP/session resolver (#5292):
   *   1. The request's own brandId.
   *   2. For an API-key caller, the key's validated `defaultBrandId`; for
   *      every other (app/agent) caller, `user.brandId` — the member's
   *      `currentBrandId` invariant, re-validated here since it can be
   *      briefly stale (e.g. right after a brand delete).
   *   3. The acting member's own `currentBrandId` in this org — for an
   *      API-key call, the KEY OWNER's member row.
   * No step ever widens to "any brand in this org".
   */
  private resolveBrandId(dto: GenerateContentDto, user: User): Promise<string> {
    return resolveGenerationBrandIdForCaller({
      explicitBrandId: dto.brandId,
      noApiKeyDefaultBrandMessage:
        'brandId is required to generate content. Configure a default brand for this API key, or pass brandId explicitly.',
      noBrandMessage: 'brandId is required to generate content.',
      services: {
        apiKeysService: this.apiKeysService,
        brandsService: this.brandsService,
        membersService: this.membersService,
      },
      user,
    });
  }
}
