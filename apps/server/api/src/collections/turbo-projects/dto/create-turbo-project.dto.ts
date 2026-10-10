import { IsEntityId } from '@api/helpers/validation/entity-id.validator';
import { TurboProjectKind } from '@genfeedai/contracts';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateTurboProjectDto {
  @ApiProperty({ enum: TurboProjectKind, enumName: 'TurboProjectKind' })
  @IsEnum(TurboProjectKind)
  readonly kind!: TurboProjectKind;

  @ApiProperty({ description: 'Brand that owns the project' })
  @IsEntityId()
  readonly brandId!: string;

  @ApiPropertyOptional({ maxLength: 120 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  readonly name?: string;

  @ApiPropertyOptional({ description: 'Saved workflow for workflow projects' })
  @IsOptional()
  @IsEntityId()
  readonly workflowId?: string;
}
