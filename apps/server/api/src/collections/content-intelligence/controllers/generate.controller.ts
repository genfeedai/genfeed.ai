import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { ApiKeysService } from '@api/collections/api-keys/services/api-keys.service';
import { GenerateContentDto } from '@api/collections/content-intelligence/dto/generate-content.dto';
import { ContentGeneratorService } from '@api/collections/content-intelligence/services/content-generator.service';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { RateLimit } from '@api/shared/decorators/rate-limit/rate-limit.decorator';
import type { JsonApiCollectionResponse } from '@genfeedai/contracts/interfaces';
import { GeneratedContentSerializer } from '@genfeedai/serializers';
import { LoggerService } from '@libs/logger/logger.service';
import {
  BadRequestException,
  Body,
  Controller,
  Post,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';

@AutoSwagger()
@Controller('content-intelligence/generate')
export class GenerateController {
  constructor(
    private readonly contentGeneratorService: ContentGeneratorService,
    private readonly apiKeysService: ApiKeysService,
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
   * Generation always has an explicit brand (#5219):
   *   1. The request's own brandId.
   *   2. For MCP/API-key calls only, the key's validated defaultBrandId — an
   *      unset or now-invalid default is rejected, never widened to "any
   *      brand in the org".
   *   3. For every other (app/agent) caller, `user.brandId` — already the
   *      member's real currentBrandId invariant, the sanctioned "app"
   *      resolution per #5219, not a guess.
   */
  private async resolveBrandId(
    dto: GenerateContentDto,
    user: User,
  ): Promise<string> {
    if (dto.brandId) {
      return dto.brandId;
    }

    if (user.isApiKey) {
      if (user.apiKeyId) {
        const apiKey = await this.apiKeysService.findOne({
          id: user.apiKeyId,
        });
        const resolved = await this.apiKeysService.resolveValidDefaultBrandId(
          user.organizationId,
          (apiKey as { defaultBrandId?: string | null } | null)?.defaultBrandId,
        );
        if (resolved) {
          return resolved;
        }
      }

      throw new BadRequestException(
        'brandId is required to generate content. Configure a default brand for this API key, or pass brandId explicitly.',
      );
    }

    if (user.brandId) {
      return user.brandId;
    }

    throw new BadRequestException('brandId is required to generate content.');
  }
}
