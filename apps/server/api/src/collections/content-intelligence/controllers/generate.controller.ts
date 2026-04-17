import { GenerateContentDto } from '@api/collections/content-intelligence/dto/generate-content.dto';
import { ContentGeneratorService } from '@api/collections/content-intelligence/services/content-generator.service';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { getPublicMetadata } from '@api/helpers/utils/clerk/clerk.util';
import { RateLimit } from '@api/shared/decorators/rate-limit/rate-limit.decorator';
import type { User } from '@clerk/backend';
import type { JsonApiCollectionResponse } from '@genfeedai/interfaces';
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
    const publicMetadata = getPublicMetadata(user);
    const organizationId = publicMetadata.organization;

    const results = await this.contentGeneratorService.generateContent(
      organizationId,
      dto,
    );

    // Format as JSON:API collection
    const docs = results.map((result, index) => ({
      attributes: {
        body: result.body,
        content: result.content,
        cta: result.cta,
        hashtags: result.hashtags,
        hook: result.hook,
        patternId: result.patternId,
        patternUsed: result.patternUsed,
      },
      id: `generated-${index}`,
      type: 'generated-content',
    }));

    return {
      data: docs,
      meta: {
        limit: results.length,
        page: 1,
        totalDocs: results.length,
        totalPages: 1,
      },
    };
  }
}
