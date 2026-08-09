import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

/**
 * Upper bound on `contentIds`. `bulkSchedule` loops the array and issues one
 * sequential `schedule.create` per element, so an unbounded array turns a
 * single request into an unbounded write loop held open for its duration.
 */
export const MAX_BULK_SCHEDULE_CONTENT_IDS = 100;

/**
 * `platforms` and `brandIds` are only ever read at index 0, but each element is
 * still validated, so they get a bound too rather than staying open-ended.
 */
export const MAX_BULK_SCHEDULE_TARGETS = 50;

export class BulkScheduleDto {
  @IsArray()
  @ArrayMaxSize(MAX_BULK_SCHEDULE_CONTENT_IDS)
  @IsString({ each: true })
  contentIds!: string[];

  @IsArray()
  @ArrayMaxSize(MAX_BULK_SCHEDULE_TARGETS)
  @IsString({ each: true })
  platforms!: string[];

  @IsArray()
  @ArrayMaxSize(MAX_BULK_SCHEDULE_TARGETS)
  @IsString({ each: true })
  brandIds!: string[];

  @IsEnum(['ai-optimal', 'evenly-distributed', 'custom'])
  schedulingStrategy!: 'ai-optimal' | 'evenly-distributed' | 'custom';

  @IsOptional()
  @IsNumber()
  @Min(0)
  staggerMinutes?: number; // Minutes between posts (default: 60)

  @IsOptional()
  @IsObject()
  customTimes?: Record<string, string>; // { contentId: ISO datetime }
}
