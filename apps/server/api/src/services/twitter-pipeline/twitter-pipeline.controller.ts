import {
  TwitterPipelineDraftDto,
  TwitterPipelinePublishDto,
  TwitterPipelineSearchDto,
} from '@api/services/twitter-pipeline/dto/twitter-pipeline.dto';
import { TwitterPipelineService } from '@api/services/twitter-pipeline/twitter-pipeline.service';
import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';

@Controller('organizations/:organizationId/twitter-pipeline')
export class TwitterPipelineController {
  constructor(
    private readonly twitterPipelineService: TwitterPipelineService,
  ) {}

  @Post('search')
  @HttpCode(HttpStatus.OK)
  search(
    @Param('organizationId') organizationId: string,
    @Body() dto: TwitterPipelineSearchDto,
  ) {
    return this.twitterPipelineService.search(
      organizationId,
      dto.brandId,
      dto.query,
      {
        maxResults: dto.maxResults,
      },
    );
  }

  @Post('draft')
  @HttpCode(HttpStatus.OK)
  draft(
    @Param('organizationId') organizationId: string,
    @Body() dto: TwitterPipelineDraftDto,
  ) {
    return this.twitterPipelineService.draft(
      organizationId,
      dto.searchResults,
      dto.voiceConfig,
    );
  }

  @Post('publish')
  @HttpCode(HttpStatus.OK)
  publish(
    @Param('organizationId') organizationId: string,
    @Body() dto: TwitterPipelinePublishDto,
  ) {
    return this.twitterPipelineService.publish(organizationId, dto.brandId, {
      targetTweetId: dto.targetTweetId,
      text: dto.text,
      type: dto.type,
    });
  }
}
