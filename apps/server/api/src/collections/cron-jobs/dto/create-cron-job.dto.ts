import {
  CRON_JOB_TYPES,
  type CronJobType,
} from '@api/collections/cron-jobs/schemas/cron-job.schema';
import {
  IsBoolean,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
} from 'class-validator';

export class CreateCronJobDto {
  @IsString()
  readonly name!: string;

  @IsIn(CRON_JOB_TYPES)
  readonly jobType!: CronJobType;

  @IsString()
  readonly schedule!: string;

  @IsOptional()
  @IsString()
  readonly timezone?: string;

  @IsOptional()
  @IsBoolean()
  readonly enabled?: boolean;

  @IsOptional()
  @IsObject()
  readonly payload?: Record<string, unknown>;
}
