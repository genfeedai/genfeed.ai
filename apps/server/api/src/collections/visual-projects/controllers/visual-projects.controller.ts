import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import { CreateVisualProjectDto } from '@api/collections/visual-projects/dto/create-visual-project.dto';
import { ExportVisualProjectDto } from '@api/collections/visual-projects/dto/export-visual-project.dto';
import { QuoteVisualProjectDto } from '@api/collections/visual-projects/dto/quote-visual-project.dto';
import { ReviseVisualProjectDto } from '@api/collections/visual-projects/dto/revise-visual-project.dto';
import { VisualProjectsService } from '@api/collections/visual-projects/services/visual-projects.service';
import { FeatureFlag } from '@api/feature-flag/feature-flag.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import {
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import {
  VisualCodeCatalogSerializer,
  VisualCodeQuoteSerializer,
  VisualProjectSerializer,
} from '@genfeedai/serializers';
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';

@ApiTags('visual-projects')
@ApiBearerAuth()
@FeatureFlag('studio_motion')
@Controller('visual-projects')
@UseGuards(RolesGuard)
export class VisualProjectsController {
  constructor(private readonly projects: VisualProjectsService) {}
  @Get('catalog') async catalog(
    @Req() req: Request,
    @CurrentUser() user: AuthenticatedUser,
    @Query('brandId') brandId?: unknown,
  ) {
    return serializeSingle(req, VisualCodeCatalogSerializer, {
      id: 'visual-code',
      ...(await this.projects.catalog(
        user,
        resolveVisualProjectBrandId(brandId, user.brandId),
      )),
    });
  }
  @Post('quote') async quote(
    @Req() req: Request,
    @CurrentUser() user: AuthenticatedUser,
    @Body() input: QuoteVisualProjectDto,
  ) {
    return serializeSingle(req, VisualCodeQuoteSerializer, {
      id: 'visual-code-quote',
      ...(await this.projects.quote(user, input)),
    });
  }
  @Get('projects') async list(
    @Req() req: Request,
    @CurrentUser() user: AuthenticatedUser,
    @Query('brandId') brandId?: unknown,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ) {
    return serializeCollection(
      req,
      VisualProjectSerializer,
      await this.projects.list(
        user,
        resolveVisualProjectBrandId(brandId, user.brandId),
        limit === undefined ? 20 : Number(limit),
        cursor,
      ),
    );
  }
  @Post('projects') async create(
    @Req() req: Request,
    @CurrentUser() user: AuthenticatedUser,
    @Body() input: CreateVisualProjectDto,
  ) {
    return serializeSingle(
      req,
      VisualProjectSerializer,
      await this.projects.create(user, input),
    );
  }
  @Get(':id') async get(
    @Req() req: Request,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Query('beforeRevision') before?: string,
    @Query('limit') limit?: string,
  ) {
    return serializeSingle(
      req,
      VisualProjectSerializer,
      await this.projects.get(
        user,
        id,
        before === undefined ? undefined : Number(before),
        limit === undefined ? (before === undefined ? 50 : 20) : Number(limit),
      ),
    );
  }
  @Post(':id/revisions') async revise(
    @Req() req: Request,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() input: ReviseVisualProjectDto,
  ) {
    return serializeSingle(
      req,
      VisualProjectSerializer,
      await this.projects.revise(user, id, input),
    );
  }
  @Post(':id/exports') async export(
    @Req() req: Request,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() input: ExportVisualProjectDto,
  ) {
    return serializeSingle(
      req,
      VisualProjectSerializer,
      await this.projects.export(user, id, input),
    );
  }
  @Post(':id/cancel') async cancel(
    @Req() req: Request,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() input: unknown,
  ) {
    return serializeSingle(
      req,
      VisualProjectSerializer,
      await this.projects.cancel(user, id, input),
    );
  }
  @Post(':id/retry') async retry(
    @Req() req: Request,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() input: unknown,
  ) {
    return serializeSingle(
      req,
      VisualProjectSerializer,
      await this.projects.retry(user, id, input),
    );
  }
  @Get(':id/revisions/:number/source') async source(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('number', ParseIntPipe) number: number,
    @Res() res: Response,
  ) {
    const source = await this.projects.source(user, id, number);
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="visual-revision-${number}.tsx"`,
    );
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'no-store');
    res.send(source);
  }
}

function resolveVisualProjectBrandId(value: unknown, fallback: string): string {
  if (Array.isArray(value)) {
    throw new BadRequestException({
      detail: 'brandId must be a single string',
      title: 'Bad Request',
    });
  }
  if (typeof value === 'string' && value.length > 0) return value;
  if (
    (value === undefined || value === '') &&
    typeof fallback === 'string' &&
    fallback.length > 0
  )
    return fallback;
  throw new BadRequestException({
    detail: 'brandId is required',
    title: 'Bad Request',
  });
}
