import { IsEntityId } from '@api/helpers/validation/entity-id.validator';
import { BatchProjectStep } from '@genfeedai/contracts';
import type { IBatchProjectSettings } from '@genfeedai/contracts/interfaces';
import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class UpdateBatchProjectDto {
  @ApiPropertyOptional({ maxLength: 120 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  readonly name?: string;

  @ApiPropertyOptional({ enum: BatchProjectStep, enumName: 'BatchProjectStep' })
  @IsOptional()
  @IsEnum(BatchProjectStep)
  readonly step?: BatchProjectStep;

  @ApiPropertyOptional({ description: 'Saved workflow for workflow batches' })
  @IsOptional()
  @IsEntityId()
  readonly workflowId?: string;

  @ApiPropertyOptional({
    description: 'Idea and schedule choices; each key replaces its section',
    additionalProperties: true,
    type: Object,
  })
  @IsOptional()
  @IsObject()
  readonly settings?: IBatchProjectSettings;
}
