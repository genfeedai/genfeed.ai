import { EvaluationType, IngredientCategory } from '@genfeedai/enums';
import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsMongoId, IsOptional } from 'class-validator';

export class EvaluateContentDto {
  @ApiProperty({
    description: 'Content type to evaluate',
    enum: [...Object.values(IngredientCategory), 'article'],
  })
  @IsEnum([...Object.values(IngredientCategory), 'article'])
  contentType!: IngredientCategory | 'article';

  @ApiProperty({
    description: 'Content ID to evaluate',
  })
  @IsMongoId()
  contentId!: string;

  @ApiProperty({
    default: EvaluationType.PRE_PUBLICATION,
    description: 'Evaluation type',
    enum: EvaluationType,
    enumName: 'EvaluationType',
    required: false,
  })
  @IsOptional()
  @IsEnum(EvaluationType)
  evaluationType?: EvaluationType;
}
