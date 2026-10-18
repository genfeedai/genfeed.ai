import { SuperAdminGuard } from '@api/common/guards/super-admin.guard';
import { IpWhitelistGuard } from '@api/endpoints/admin/guards/ip-whitelist.guard';
import { RateLimit } from '@api/shared/decorators/rate-limit/rate-limit.decorator';
import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { SeedArticlesDto } from './dto/seed-articles.dto';
import { SeedTemplatesDto } from './dto/seed-templates.dto';
import { SeedWorkflowsDto } from './dto/seed-workflows.dto';
import {
  AdminSeedsService,
  type ArticlesSeedSummary,
  type TemplatesSeedSummary,
  type WorkflowsSeedSummary,
} from './seeds.service';

/**
 * Idempotent one-off data seeds, runnable without a deploy or database access.
 * All default to a dry run and report what a live run would do.
 */
@ApiTags('Admin / Seeds')
@Controller('admin/seeds')
@UseGuards(IpWhitelistGuard, SuperAdminGuard)
export class AdminSeedsController {
  constructor(private readonly seeds: AdminSeedsService) {}

  @Post('articles')
  @HttpCode(200)
  @RateLimit({ limit: 5, scope: 'user', windowMs: 60_000 })
  @ApiOperation({ summary: 'Publish the launch and help articles' })
  articles(@Body() dto: SeedArticlesDto): Promise<ArticlesSeedSummary> {
    return this.seeds.seedArticles(dto);
  }

  @Post('templates')
  @HttpCode(200)
  @RateLimit({ limit: 5, scope: 'user', windowMs: 60_000 })
  @ApiOperation({ summary: 'Create the missing platform (system) templates' })
  templates(@Body() dto: SeedTemplatesDto): Promise<TemplatesSeedSummary> {
    return this.seeds.seedTemplates(dto);
  }

  @Post('workflows')
  @HttpCode(200)
  @RateLimit({ limit: 5, scope: 'user', windowMs: 60_000 })
  @ApiOperation({ summary: 'Ensure the default recurring workflows per brand' })
  workflows(@Body() dto: SeedWorkflowsDto): Promise<WorkflowsSeedSummary> {
    return this.seeds.seedWorkflows(dto);
  }
}
