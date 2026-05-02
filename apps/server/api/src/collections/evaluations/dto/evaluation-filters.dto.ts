import { IsEntityId } from '@api/helpers/validation/entity-id.validator';
import { EvaluationType, IngredientCategory } from '@genfeedai/enums';
import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsOptional, IsString } from 'class-validator';

export class EvaluationFiltersDto {
  @ApiProperty({
    description: 'Filter by content type',
    enum: [...Object.values(IngredientCategory), 'article'],
    required: false,
  })
  @IsOptional()
  @IsEnum([...Object.values(IngredientCategory), 'article'])
  contentType?: IngredientCategory | 'article';

  @ApiProperty({
    description: 'Filter by evaluation type',
    enum: EvaluationType,
    enumName: 'EvaluationType',
    required: false,
  })
  @IsOptional()
  @IsEnum(EvaluationType)
  evaluationType?: EvaluationType;

  @ApiProperty({
    description: 'Filter by brand ID',
    required: false,
  })
  @IsOptional()
  @IsEntityId()
  brand?: string;

  @ApiProperty({
    description: 'Start date filter',
    required: false,
  })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiProperty({
    description: 'End date filter',
    required: false,
  })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiProperty({
    description: 'Minimum overall score',
    required: false,
  })
  @IsOptional()
  @IsString()
  minScore?: string;

  @ApiProperty({
    description: 'Maximum overall score',
    required: false,
  })
  @IsOptional()
  @IsString()
  maxScore?: string;
}
