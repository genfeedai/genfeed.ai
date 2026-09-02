import { Type } from 'class-transformer';
import {
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

class ContentMixDto {
  @IsNumber()
  @Min(0)
  @Max(100)
  imagePercent!: number;

  @IsNumber()
  @Min(0)
  @Max(100)
  videoPercent!: number;

  @IsNumber()
  @Min(0)
  @Max(100)
  carouselPercent!: number;

  @IsNumber()
  @Min(0)
  @Max(100)
  reelPercent!: number;

  @IsNumber()
  @Min(0)
  @Max(100)
  storyPercent!: number;
}

class DateRangeDto {
  @IsString()
  start!: string;

  @IsString()
  end!: string;
}

export class CreateBatchDto {
  @IsNumber()
  @Min(1)
  @Max(100)
  count!: number;

  @IsString()
  brandId!: string;

  @IsArray()
  @IsString({ each: true })
  platforms!: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  topics?: string[];

  @IsOptional()
  @ValidateNested()
  @Type(() => ContentMixDto)
  contentMix?: ContentMixDto;

  @ValidateNested()
  @Type(() => DateRangeDto)
  dateRange!: DateRangeDto;

  @IsOptional()
  @IsString()
  style?: string;
}
