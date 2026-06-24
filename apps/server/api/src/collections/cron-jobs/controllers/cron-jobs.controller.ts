import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { CronJobQueryDto } from '@api/collections/cron-jobs/dto/cron-job-query.dto';
import {
  CronJobsService,
  LEGACY_CRON_JOBS_RETIRED_MESSAGE,
} from '@api/collections/cron-jobs/services/cron-jobs.service';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { getPublicMetadata } from '@api/helpers/utils/auth/auth.util';
import {
  returnNotFound,
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import type { JsonApiSingleResponse } from '@genfeedai/interfaces';
import { CronJobSerializer, CronRunSerializer } from '@genfeedai/serializers';
import {
  Controller,
  Delete,
  Get,
  GoneException,
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

  private throwRetiredMutation(): never {
    throw new GoneException(LEGACY_CRON_JOBS_RETIRED_MESSAGE);
  }

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
  create(): never {
    this.throwRetiredMutation();
  }

  @Patch(':id')
  update(): never {
    this.throwRetiredMutation();
  }

  @Post(':id/run-now')
  runNow(): never {
    this.throwRetiredMutation();
  }

  @Post(':id/pause')
  pause(): never {
    this.throwRetiredMutation();
  }

  @Post(':id/resume')
  resume(): never {
    this.throwRetiredMutation();
  }

  @Delete(':id')
  delete(): never {
    this.throwRetiredMutation();
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
