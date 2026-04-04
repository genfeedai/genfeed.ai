import { IpWhitelistGuard } from '@api/endpoints/admin/guards/ip-whitelist.guard';
import { ErrorResponse } from '@api/helpers/utils/error-response/error-response.util';
import { AiInfluencerService } from '@api/services/ai-influencer/ai-influencer.service';
import {
  GeneratePostDto,
  ListPostsQueryDto,
} from '@api/services/ai-influencer/dto/generate-post.dto';
import { LoggerService } from '@libs/logger/logger.service';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

@ApiTags('Admin / AI Influencer')
@Controller('admin/ai-influencer')
@UseGuards(IpWhitelistGuard)
export class AiInfluencerController {
  constructor(
    private readonly aiInfluencerService: AiInfluencerService,
    private readonly loggerService: LoggerService,
  ) {}

  @Post('generate')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Generate and publish a post for a specific persona',
  })
  async generatePost(@Body() dto: GeneratePostDto) {
    try {
      const result = await this.aiInfluencerService.generateDailyPost(
        dto.personaSlug,
        dto.platforms,
        {
          aspectRatio: dto.aspectRatio,
          captionOverride: dto.caption,
          promptOverride: dto.prompt,
        },
      );

      return {
        data: result,
        success: true,
      };
    } catch (error) {
      return ErrorResponse.handle(
        error,
        this.loggerService,
        'AiInfluencerController.generatePost',
      );
    }
  }

  @Post('schedule')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Trigger daily schedule for all personas with autopilot enabled',
  })
  async scheduleDailyPosts() {
    try {
      const results = await this.aiInfluencerService.scheduleDailyPosts();

      return {
        data: {
          results,
          totalGenerated: results.length,
        },
        success: true,
      };
    } catch (error) {
      return ErrorResponse.handle(
        error,
        this.loggerService,
        'AiInfluencerController.scheduleDailyPosts',
      );
    }
  }

  @Get('posts')
  @ApiOperation({ summary: 'List generated AI influencer posts' })
  async listPosts(@Query() query: ListPostsQueryDto) {
    try {
      const result = await this.aiInfluencerService.listPosts({
        limit: query.limit,
        page: query.page,
        personaSlug: query.personaSlug,
      });

      return {
        data: result.docs,
        meta: {
          limit: result.limit,
          page: result.page,
          totalDocs: result.totalDocs,
        },
        success: true,
      };
    } catch (error) {
      return ErrorResponse.handle(
        error,
        this.loggerService,
        'AiInfluencerController.listPosts',
      );
    }
  }
}
