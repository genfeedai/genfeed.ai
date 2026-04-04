import { CreateNewsletterDto } from '@api/collections/newsletters/dto/create-newsletter.dto';
import { GenerateNewsletterDraftDto } from '@api/collections/newsletters/dto/generate-newsletter-draft.dto';
import { GenerateNewsletterTopicsDto } from '@api/collections/newsletters/dto/generate-newsletter-topics.dto';
import { NewslettersQueryDto } from '@api/collections/newsletters/dto/newsletters-query.dto';
import { UpdateNewsletterDto } from '@api/collections/newsletters/dto/update-newsletter.dto';
import { NewslettersService } from '@api/collections/newsletters/services/newsletters.service';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { extractRequestContext } from '@api/helpers/utils/clerk/clerk.util';
import {
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import type { User } from '@clerk/backend';
import { NewsletterSerializer } from '@genfeedai/serializers';
import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';

@AutoSwagger()
@Controller('newsletters')
@UseGuards(RolesGuard)
export class NewslettersController {
  constructor(private readonly newslettersService: NewslettersService) {}

  @Get()
  async findAll(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Query() query: NewslettersQueryDto,
  ) {
    const ctx = extractRequestContext(user, query);
    const pipeline = this.newslettersService.buildListPipeline(ctx, query);
    const data = await this.newslettersService.findAll(pipeline, {
      limit: query.limit,
      page: query.page,
      pagination: query.pagination,
    });

    return serializeCollection(request, NewsletterSerializer, {
      docs: data.docs,
      limit: data.limit,
      page: data.page,
      pages: data.totalPages,
      total: data.totalDocs,
    });
  }

  @Get(':id')
  async findOne(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
  ) {
    const ctx = extractRequestContext(user);
    const data = await this.newslettersService.findOneScoped(id, ctx);
    return serializeSingle(request, NewsletterSerializer, data);
  }

  @Post()
  async create(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Body() dto: CreateNewsletterDto,
  ) {
    const ctx = extractRequestContext(user);
    const data = await this.newslettersService.createScoped(dto, ctx);
    return serializeSingle(request, NewsletterSerializer, data);
  }

  @Patch(':id')
  async patch(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() dto: UpdateNewsletterDto,
  ) {
    const ctx = extractRequestContext(user);
    const data = await this.newslettersService.updateScoped(id, dto, ctx);
    return serializeSingle(request, NewsletterSerializer, data);
  }

  @Post('topic-proposals')
  async topicProposals(
    @CurrentUser() user: User,
    @Body() dto: GenerateNewsletterTopicsDto,
  ) {
    const ctx = extractRequestContext(user);
    return {
      data: await this.newslettersService.generateTopicProposals(dto, ctx),
    };
  }

  @Post('generate-draft')
  async generateDraft(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Body() dto: GenerateNewsletterDraftDto,
  ) {
    const ctx = extractRequestContext(user);
    const data = await this.newslettersService.generateDraft(dto, ctx);
    return serializeSingle(request, NewsletterSerializer, data);
  }

  @Get(':id/context')
  async context(@CurrentUser() user: User, @Param('id') id: string) {
    const ctx = extractRequestContext(user);
    return {
      data: await this.newslettersService.getContextPreview(id, ctx),
    };
  }

  @Post(':id/approve')
  async approve(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
  ) {
    const ctx = extractRequestContext(user);
    const data = await this.newslettersService.approveScoped(id, ctx);
    return serializeSingle(request, NewsletterSerializer, data);
  }

  @Post(':id/publish')
  async publish(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
  ) {
    const ctx = extractRequestContext(user);
    const data = await this.newslettersService.publishScoped(id, ctx);
    return serializeSingle(request, NewsletterSerializer, data);
  }

  @Post(':id/archive')
  async archive(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
  ) {
    const ctx = extractRequestContext(user);
    const data = await this.newslettersService.archiveScoped(id, ctx);
    return serializeSingle(request, NewsletterSerializer, data);
  }
}
