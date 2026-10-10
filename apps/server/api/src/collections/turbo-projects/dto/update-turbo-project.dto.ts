import { IsEntityId } from '@api/helpers/validation/entity-id.validator';
import { TurboProjectStep } from '@genfeedai/contracts';
import type { ITurboProjectSettings } from '@genfeedai/contracts/interfaces';
import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class UpdateTurboProjectDto {
  @ApiPropertyOptional({ maxLength: 120 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  readonly name?: string;

  @ApiPropertyOptional({ enum: TurboProjectStep, enumName: 'TurboProjectStep' })
  @IsOptional()
  @IsEnum(TurboProjectStep)
  readonly step?: TurboProjectStep;

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
  readonly settings?: ITurboProjectSettings;
}
