import type {
  StoryboardPlan,
  StoryboardPlanSettings,
} from '@genfeedai/contracts/api-types/contracts/storyboard-plan.contract';
import type { CreateStoryboardRunQuote } from '@genfeedai/contracts/api-types/contracts/storyboard-run-quote.contract';
import { storyboardOperationSchema } from '@genfeedai/contracts/api-types/contracts/storyboard-run-quote.contract';
import type { StoryboardSourceSelector } from '@genfeedai/contracts/api-types/contracts/storyboard-source.contract';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateStoryboardRunDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  clientRequestId!: string;

  @ApiProperty({ type: Object })
  @IsObject()
  source!: StoryboardSourceSelector;

  @ApiProperty({ type: Object, required: false })
  @IsOptional()
  @IsObject()
  planSettings?: StoryboardPlanSettings;
}

export class ControlStoryboardRunDto {
  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  expectedRevision!: number;
}
export class UpdateStoryboardPlanDto extends ControlStoryboardRunDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  capabilityVersion?: string;
  @ApiProperty({ type: Object })
  @IsObject()
  plan!: StoryboardPlan;
}
export class ResetStoryboardPlanDto extends ControlStoryboardRunDto {}
export class ApproveStoryboardPlanDto extends ControlStoryboardRunDto {}
export class UpdateStoryboardSourceDto extends ControlStoryboardRunDto {
  @ApiProperty({ type: Object })
  @IsObject()
  source!: StoryboardSourceSelector;
}
export class ListStoryboardRunsDto {
  @ApiProperty({ default: 1, minimum: 1, required: false })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiProperty({ default: 20, maximum: 100, minimum: 1, required: false })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class CreateStoryboardRunQuoteDto extends ControlStoryboardRunDto {
  @ApiProperty({ enum: storyboardOperationSchema.options })
  @IsIn(storyboardOperationSchema.options)
  operation!: CreateStoryboardRunQuote['operation'];
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  shotId?: string;
  @ApiProperty({ enum: ['image', 'video'], required: false })
  @IsOptional()
  @IsIn(['image', 'video'])
  repairStage?: 'image' | 'video';
}
export class ExecuteStoryboardRunDto extends ControlStoryboardRunDto {
  @ApiProperty()
  @IsString()
  quoteId!: string;
}
export class CancelStoryboardRunDto extends ControlStoryboardRunDto {
  @ApiProperty()
  @IsString()
  operationId!: string;
}
export class ResumeStoryboardRunDto extends ControlStoryboardRunDto {
  @ApiProperty()
  @IsString()
  operationId!: string;
}

export class ReplaceStoryboardCharacterDto {
  @ApiProperty({ maxItems: 8, minItems: 1, type: [String] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(8)
  @IsString({ each: true })
  imageAssetIds!: string[];

  @ApiProperty({ maxLength: 1000, required: false })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  prompt?: string;
}
