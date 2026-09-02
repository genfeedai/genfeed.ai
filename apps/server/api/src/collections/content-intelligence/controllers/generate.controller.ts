import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { GenerateContentDto } from '@api/collections/content-intelligence/dto/generate-content.dto';
import { ContentGeneratorService } from '@api/collections/content-intelligence/services/content-generator.service';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { RateLimit } from '@api/shared/decorators/rate-limit/rate-limit.decorator';
import type { JsonApiCollectionResponse } from '@genfeedai/interfaces';
import { GeneratedContentSerializer } from '@genfeedai/serializers';
import { LoggerService } from '@libs/logger/logger.service';
import { Body, Controller, Post, Req } from '@nestjs/common';
import type { Request } from 'express';

@AutoSwagger()
@Controller('content-intelligence/generate')
export class GenerateController {
  constructor(
    private readonly contentGeneratorService: ContentGeneratorService,
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

    const results = await this.contentGeneratorService.generateContentWorkflow(
      user.userId ?? user.id,
      organizationId,
      dto,
    );

    return GeneratedContentSerializer.serializeCollection(results);
  }
}
