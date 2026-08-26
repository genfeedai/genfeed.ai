import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { AnalyzeListeningTopicDto } from '@api/collections/listening-topics/dto/analyze-listening-topic.dto';
import { CollectListeningTopicDto } from '@api/collections/listening-topics/dto/collect-listening-topic.dto';
import { CreateListeningTopicDto } from '@api/collections/listening-topics/dto/create-listening-topic.dto';
import {
  ListeningAnalysisQueryDto,
  ListeningEvidenceQueryDto,
  ListeningTopicsQueryDto,
} from '@api/collections/listening-topics/dto/listening-topics-query.dto';
import { ReviewListeningThemeDto } from '@api/collections/listening-topics/dto/review-listening-theme.dto';
import { UpdateListeningTopicDto } from '@api/collections/listening-topics/dto/update-listening-topic.dto';
import { serializeListeningAnalysis } from '@api/collections/listening-topics/helpers/listening-analysis-response.helper';
import { ListeningTopicAnalysisService } from '@api/collections/listening-topics/services/listening-topic-analysis.service';
import { ListeningTopicAttributionService } from '@api/collections/listening-topics/services/listening-topic-attribution.service';
import { ListeningTopicCollectorService } from '@api/collections/listening-topics/services/listening-topic-collector.service';
import { ListeningTopicsService } from '@api/collections/listening-topics/services/listening-topics.service';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { BrandScopeQueryDto } from '@api/helpers/dto/brand-scope-query.dto';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { resolveRequiredBrandRequestContext } from '@api/helpers/utils/auth/auth.util';
import {
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import {
  ListeningEvidenceSerializer,
  ListeningSignalSerializer,
  ListeningThemeSerializer,
  ListeningTopicOutcomeSerializer,
  ListeningTopicSerializer,
} from '@genfeedai/serializers';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

@ApiTags('Listening Topics')
@Controller('listening-topics')
@UseGuards(RolesGuard)
export class ListeningTopicsController {
  constructor(
    private readonly listeningTopicsService: ListeningTopicsService,
    private readonly listeningTopicCollectorService: ListeningTopicCollectorService,
    private readonly listeningTopicAnalysisService: ListeningTopicAnalysisService,
    private readonly listeningTopicAttributionService: ListeningTopicAttributionService,
  ) {}

  @Get()
  async findAll(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Query() query: ListeningTopicsQueryDto,
  ) {
    const context = resolveRequiredBrandRequestContext(user, query);
    const result = await this.listeningTopicsService.findAllScoped(
      context,
      query,
    );
    return serializeCollection(request, ListeningTopicSerializer, result);
  }

  @Post()
  async create(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Body() body: CreateListeningTopicDto,
  ) {
    const context = resolveRequiredBrandRequestContext(user);
    const topic = await this.listeningTopicsService.createScoped(body, context);
    return serializeSingle(request, ListeningTopicSerializer, topic);
  }

  @Get(':id')
  async findOne(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Query() query: BrandScopeQueryDto,
    @Param('id') id: string,
  ) {
    const context = resolveRequiredBrandRequestContext(user, query);
    const topic = await this.listeningTopicsService.findOneScoped(id, context);
    return serializeSingle(request, ListeningTopicSerializer, topic);
  }

  @Post(':id/collect')
  @HttpCode(HttpStatus.OK)
  async collect(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Query() query: BrandScopeQueryDto,
    @Param('id') id: string,
    @Body() body: CollectListeningTopicDto,
  ) {
    const context = resolveRequiredBrandRequestContext(user, query);
    const topic = await this.listeningTopicCollectorService.collectScoped(
      id,
      body,
      context,
    );
    return serializeSingle(request, ListeningTopicSerializer, topic);
  }

  @Post(':id/analyze')
  @HttpCode(HttpStatus.OK)
  async analyze(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Query() query: BrandScopeQueryDto,
    @Param('id') id: string,
    @Body() body: AnalyzeListeningTopicDto,
  ) {
    const context = resolveRequiredBrandRequestContext(user, query);
    const result = await this.listeningTopicAnalysisService.analyzeScoped(
      id,
      body,
      context,
    );
    return serializeListeningAnalysis(request, result);
  }

  @Patch(':topicId/themes/:themeId/review')
  async reviewTheme(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Query() query: BrandScopeQueryDto,
    @Param('topicId') topicId: string,
    @Param('themeId') themeId: string,
    @Body() body: ReviewListeningThemeDto,
  ) {
    const context = resolveRequiredBrandRequestContext(user, query);
    const theme = await this.listeningTopicAnalysisService.reviewThemeScoped(
      topicId,
      themeId,
      body,
      context,
    );
    return serializeSingle(request, ListeningThemeSerializer, theme);
  }

  @Get(':topicId/themes/:themeId/outcomes')
  async listThemeOutcomes(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Query() query: BrandScopeQueryDto,
    @Param('topicId') topicId: string,
    @Param('themeId') themeId: string,
  ) {
    const context = resolveRequiredBrandRequestContext(user, query);
    const outcomes =
      await this.listeningTopicAttributionService.listOutcomesScoped(
        topicId,
        themeId,
        context,
      );
    return serializeCollection(request, ListeningTopicOutcomeSerializer, {
      docs: outcomes,
    });
  }

  @Patch(':id')
  async update(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Query() query: BrandScopeQueryDto,
    @Param('id') id: string,
    @Body() body: UpdateListeningTopicDto,
  ) {
    const context = resolveRequiredBrandRequestContext(user, query);
    const topic = await this.listeningTopicsService.updateScoped(
      id,
      body,
      context,
    );
    return serializeSingle(request, ListeningTopicSerializer, topic);
  }

  @Delete(':id')
  async remove(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Query() query: BrandScopeQueryDto,
    @Param('id') id: string,
  ) {
    const context = resolveRequiredBrandRequestContext(user, query);
    const topic = await this.listeningTopicsService.removeScoped(id, context);
    return serializeSingle(request, ListeningTopicSerializer, topic);
  }

  @Get(':id/evidence')
  async listEvidence(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Query() query: ListeningEvidenceQueryDto,
  ) {
    const context = resolveRequiredBrandRequestContext(user, query);
    const result = await this.listeningTopicsService.listEvidence(
      id,
      context,
      query,
    );
    return serializeCollection(request, ListeningEvidenceSerializer, result);
  }

  @Get(':id/themes')
  async listThemes(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Query() query: ListeningAnalysisQueryDto,
  ) {
    const context = resolveRequiredBrandRequestContext(user, query);
    const result = await this.listeningTopicAnalysisService.listThemesScoped(
      id,
      context,
      query,
    );
    return serializeCollection(request, ListeningThemeSerializer, result);
  }

  @Get(':id/signals')
  async listSignals(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Query() query: ListeningAnalysisQueryDto,
  ) {
    const context = resolveRequiredBrandRequestContext(user, query);
    const result = await this.listeningTopicAnalysisService.listSignalsScoped(
      id,
      context,
      query,
    );
    return serializeCollection(request, ListeningSignalSerializer, result);
  }
}
