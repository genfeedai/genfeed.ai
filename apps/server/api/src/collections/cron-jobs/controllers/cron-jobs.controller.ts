import { CreateCronJobDto } from '@api/collections/cron-jobs/dto/create-cron-job.dto';
import { CronJobQueryDto } from '@api/collections/cron-jobs/dto/cron-job-query.dto';
import { UpdateCronJobDto } from '@api/collections/cron-jobs/dto/update-cron-job.dto';
import { CronJobsService } from '@api/collections/cron-jobs/services/cron-jobs.service';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { getPublicMetadata } from '@api/helpers/utils/clerk/clerk.util';
import {
  returnNotFound,
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import type { User } from '@clerk/backend';
import type { JsonApiSingleResponse } from '@genfeedai/interfaces';
import { CronJobSerializer, CronRunSerializer } from '@genfeedai/serializers';
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';

@Controller('cron-jobs')
export class CronJobsController {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(private readonly cronJobsService: CronJobsService) {}

  @Get()
  async findAll(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Query() query: CronJobQueryDto,
  ) {
    const metadata = getPublicMetadata(user);
    const docs = await this.cronJobsService.list(metadata.organization, {
      enabled:
        query.enabled === undefined ? undefined : query.enabled === 'true',
      jobType: query.jobType,
    });

    return serializeCollection(request, CronJobSerializer, { docs });
  }

  @Post()
  async create(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Body() dto: CreateCronJobDto,
  ): Promise<JsonApiSingleResponse> {
    const metadata = getPublicMetadata(user);
    const created = await this.cronJobsService.create(
      metadata.user,
      metadata.organization,
      dto,
    );

    return serializeSingle(request, CronJobSerializer, created);
  }

  @Patch(':id')
  async update(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() dto: UpdateCronJobDto,
  ): Promise<JsonApiSingleResponse> {
    const metadata = getPublicMetadata(user);
    const updated = await this.cronJobsService.update(
      id,
      metadata.organization,
      dto,
    );

    return updated
      ? serializeSingle(request, CronJobSerializer, updated)
      : returnNotFound(this.constructorName, id);
  }

  @Post(':id/run-now')
  async runNow(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
  ): Promise<JsonApiSingleResponse> {
    const metadata = getPublicMetadata(user);
    const run = await this.cronJobsService.runNow(id, metadata.organization);

    return run
      ? serializeSingle(request, CronRunSerializer, run)
      : returnNotFound(this.constructorName, id);
  }

  @Post(':id/pause')
  async pause(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
  ): Promise<JsonApiSingleResponse> {
    const metadata = getPublicMetadata(user);
    const paused = await this.cronJobsService.pause(id, metadata.organization);

    return paused
      ? serializeSingle(request, CronJobSerializer, paused)
      : returnNotFound(this.constructorName, id);
  }

  @Post(':id/resume')
  async resume(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
  ): Promise<JsonApiSingleResponse> {
    const metadata = getPublicMetadata(user);
    const resumed = await this.cronJobsService.resume(
      id,
      metadata.organization,
    );

    return resumed
      ? serializeSingle(request, CronJobSerializer, resumed)
      : returnNotFound(this.constructorName, id);
  }

  @Delete(':id')
  async delete(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
  ): Promise<JsonApiSingleResponse> {
    const metadata = getPublicMetadata(user);
    const deleted = await this.cronJobsService.delete(
      id,
      metadata.organization,
    );

    return deleted
      ? serializeSingle(request, CronJobSerializer, deleted)
      : returnNotFound(this.constructorName, id);
  }

  @Get(':id/runs')
  async runs(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
  ) {
    const metadata = getPublicMetadata(user);
    const docs = await this.cronJobsService.getRuns(id, metadata.organization);

    return serializeCollection(request, CronRunSerializer, { docs });
  }

  @Get(':id/runs/:runId')
  async runById(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Param('runId') runId: string,
  ): Promise<JsonApiSingleResponse> {
    const metadata = getPublicMetadata(user);
    const run = await this.cronJobsService.getRun(
      id,
      runId,
      metadata.organization,
    );

    return run
      ? serializeSingle(request, CronRunSerializer, run)
      : returnNotFound(this.constructorName, runId);
  }
}
