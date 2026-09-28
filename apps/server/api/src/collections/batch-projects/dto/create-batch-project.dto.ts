import { IsEntityId } from '@api/helpers/validation/entity-id.validator';
import { BatchProjectKind } from '@genfeedai/contracts';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateBatchProjectDto {
  @ApiProperty({ enum: BatchProjectKind, enumName: 'BatchProjectKind' })
  @IsEnum(BatchProjectKind)
  readonly kind!: BatchProjectKind;

  @ApiProperty({ description: 'Brand that owns the batch' })
  @IsEntityId()
  readonly brandId!: string;

  @ApiPropertyOptional({ maxLength: 120 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  readonly name?: string;

  @ApiPropertyOptional({ description: 'Saved workflow for workflow batches' })
  @IsOptional()
  @IsEntityId()
  readonly workflowId?: string;
}
