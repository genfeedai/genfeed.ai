import {
  IsArray,
  IsEnum,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class BulkScheduleDto {
  @IsArray()
  @IsString({ each: true })
  contentIds!: string[];

  @IsArray()
  @IsString({ each: true })
  platforms!: string[];

  @IsArray()
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
