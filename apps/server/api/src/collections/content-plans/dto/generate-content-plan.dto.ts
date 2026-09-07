import { IsEntityId } from '@api/helpers/validation/entity-id.validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

/** Caller-chosen subset of cold-start seeds forwarded to plan generation. */
export class ContentPlanSeedSelectionDto {
  @IsArray()
  @IsEntityId({ each: true })
  @IsOptional()
  @ApiProperty({
    description: 'Watched-advertiser IDs to ground the plan in',
    required: false,
    type: [String],
  })
  readonly advertiserIds?: string[];

  @IsArray()
  @IsEntityId({ each: true })
  @IsOptional()
  @ApiProperty({
    description: 'Followed-creator social source IDs to ground the plan in',
    required: false,
    type: [String],
  })
  readonly sourceIds?: string[];

  @IsBoolean()
  @IsOptional()
  @ApiProperty({
    default: true,
    description: "Whether to include the brand's own imported history",
    required: false,
  })
  readonly isImportedHistoryIncluded?: boolean;

  @IsBoolean()
  @IsOptional()
  @ApiProperty({
    default: true,
    description: 'Whether to include extracted creative patterns',
    required: false,
  })
  readonly isPatternsIncluded?: boolean;
}

export class GenerateContentPlanDto {
  @IsString()
  @IsOptional()
  readonly name?: string;

  @IsDateString()
  readonly periodStart!: string;

  @IsDateString()
  readonly periodEnd!: string;

  @IsNumber()
  @Min(1)
  @Max(50)
  @IsOptional()
  readonly itemCount?: number;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  readonly topics?: string[];

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  readonly platforms?: string[];

  @IsString()
  @IsOptional()
  readonly additionalInstructions?: string;

  @ValidateNested()
  @Type(() => ContentPlanSeedSelectionDto)
  @IsOptional()
  readonly seeds?: ContentPlanSeedSelectionDto;
}
