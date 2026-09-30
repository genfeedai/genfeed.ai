import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import { LearningMutationDto } from '@api/collections/content-learning/dto/learning-control.dto';
import { LearningDatasetDto } from '@api/collections/content-learning/dto/learning-dataset.dto';
import { LearningQueryDto } from '@api/collections/content-learning/dto/learning-query.dto';
import {
  LearningReleaseControlDto,
  LearningReleaseDto,
} from '@api/collections/content-learning/dto/learning-release.dto';
import {
  LearningRunControlDto,
  LearningRunDto,
} from '@api/collections/content-learning/dto/learning-run.dto';
import { LearningAccountService } from '@api/collections/content-learning/services/learning-account.service';
import { LearningDatasetService } from '@api/collections/content-learning/services/learning-dataset.service';
import { LearningReleaseService } from '@api/collections/content-learning/services/learning-release.service';
import { LearningRunService } from '@api/collections/content-learning/services/learning-run.service';
import { SuperAdminGuard } from '@api/common/guards/super-admin.guard';
import { IpWhitelistGuard } from '@api/endpoints/admin/guards/ip-whitelist.guard';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import {
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  ContentLearningAccountSerializer,
  ContentLearningDatasetSerializer,
  ContentLearningOperationSerializer,
  ContentLearningReleaseSerializer,
  ContentLearningRunSerializer,
} from '@genfeedai/serializers';
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import type { Request } from 'express';
@Controller('admin/content-learning')
@UseGuards(IpWhitelistGuard, SuperAdminGuard)
@UsePipes(
  new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  }),
)
export class ContentLearningAdminController {
  constructor(
    private readonly accountsService: LearningAccountService,
    private readonly datasets: LearningDatasetService,
    private readonly runs: LearningRunService,
    private readonly releases: LearningReleaseService,
    private readonly prisma: PrismaService,
  ) {}
  @Get('accounts') async accounts(
    @Req() request: Request,
    @Query() query: LearningQueryDto,
  ) {
    return serializeCollection(request, ContentLearningAccountSerializer, {
      docs: await this.prisma.contentLearningAccount.findMany({
        where: { isDeleted: false },
        take: query.limit,
        skip: (query.page - 1) * query.limit,
        orderBy: { updatedAt: 'desc' },
      }),
    });
  }
  @Get('datasets') async datasetList(
    @Req() request: Request,
    @Query() query: LearningQueryDto,
  ) {
    return serializeCollection(request, ContentLearningDatasetSerializer, {
      docs: await this.prisma.contentLearningDataset.findMany({
        where: { isDeleted: false },
        take: query.limit,
        skip: (query.page - 1) * query.limit,
        orderBy: { createdAt: 'desc' },
      }),
    });
  }
  @Get('runs') async runList(
    @Req() request: Request,
    @Query() query: LearningQueryDto,
  ) {
    return serializeCollection(request, ContentLearningRunSerializer, {
      docs: await this.prisma.contentLearningRun.findMany({
        where: { isDeleted: false },
        take: query.limit,
        skip: (query.page - 1) * query.limit,
        orderBy: { createdAt: 'desc' },
      }),
    });
  }
  @Get('releases') async releaseList(
    @Req() request: Request,
    @Query() query: LearningQueryDto,
  ) {
    return serializeCollection(request, ContentLearningReleaseSerializer, {
      docs: await this.prisma.contentLearningRelease.findMany({
        where: { isDeleted: false },
        take: query.limit,
        skip: (query.page - 1) * query.limit,
        orderBy: { createdAt: 'desc' },
      }),
    });
  }
  @Post('datasets') async createDataset(
    @Req() request: Request,
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: LearningDatasetDto,
  ) {
    if (Buffer.byteLength(JSON.stringify(body), 'utf8') > 10 * 1024 * 1024)
      throw new BadRequestException('Dataset import exceeds 10 MiB');
    return serializeSingle(
      request,
      ContentLearningDatasetSerializer,
      await this.datasets.create({
        ...body,
        actorId: user.userId ?? user.id,
        organizationId: user.organizationId,
      }),
    );
  }
  @Post('datasets/:id/train') async train(
    @Req() request: Request,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: LearningRunDto,
  ) {
    return serializeSingle(
      request,
      ContentLearningRunSerializer,
      await this.runs.request({
        ...body,
        datasetId: id,
        actorId: user.userId ?? user.id,
        organizationId: user.organizationId,
        type: 'train',
      }),
    );
  }
  @Post('runs/:id/evaluate') async evaluate(
    @Req() request: Request,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: LearningRunDto,
  ) {
    const parent = await this.prisma.contentLearningRun.findFirst({
      where: { id, type: 'train', status: 'completed', isDeleted: false },
    });
    if (!parent)
      throw new BadRequestException('Completed parent training required');
    return serializeSingle(
      request,
      ContentLearningRunSerializer,
      await this.runs.request({
        ...body,
        datasetId: parent.datasetId,
        parentArtifactId: parent.resultArtifactId ?? undefined,
        actorId: user.userId ?? user.id,
        organizationId: user.organizationId,
        type: 'evaluate',
      }),
    );
  }
  @Post('runs/:id/cancel') async cancel(
    @Req() request: Request,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: LearningRunControlDto,
  ) {
    return serializeSingle(
      request,
      ContentLearningRunSerializer,
      await this.runs.cancel({
        id,
        requestId: body.requestId,
        actorId: user.userId ?? user.id,
        organizationId: user.organizationId,
      }),
    );
  }
  @Post('runs/:id/retry') async retry(
    @Req() request: Request,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: LearningRunControlDto,
  ) {
    return serializeSingle(
      request,
      ContentLearningRunSerializer,
      await this.runs.retry({
        id,
        requestId: body.requestId,
        actorId: user.userId ?? user.id,
        organizationId: user.organizationId,
      }),
    );
  }
  @Post('releases') async createRelease(
    @Req() request: Request,
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: LearningReleaseDto,
  ) {
    return serializeSingle(
      request,
      ContentLearningOperationSerializer,
      await this.releases.create({
        ...body,
        actorId: user.userId ?? user.id,
        organizationId: user.organizationId,
      }),
    );
  }
  @Post('releases/:id/control') async controlRelease(
    @Req() request: Request,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: LearningReleaseControlDto,
  ) {
    return serializeSingle(
      request,
      ContentLearningOperationSerializer,
      await this.releases.control({
        ...body,
        id,
        actorId: user.userId ?? user.id,
        organizationId: user.organizationId,
      }),
    );
  }
  @Post('accounts/:id/pause') async pauseAccount(
    @Req() request: Request,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: LearningMutationDto,
  ) {
    return serializeSingle(
      request,
      ContentLearningOperationSerializer,
      await this.accountsService.emergencyPause(user.userId ?? user.id, id, {
        ...body,
        reason: 'admin_emergency_pause',
      }),
    );
  }
  @Get('health') async health(
    @Req() request: Request,
    @Query() query: LearningQueryDto,
  ) {
    return this.accounts(request, query);
  }
}
