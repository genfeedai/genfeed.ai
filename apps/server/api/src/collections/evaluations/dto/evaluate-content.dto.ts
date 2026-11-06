import { EvaluationType } from '@genfeedai/contracts';
import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';

/**
 * Body of `POST /evaluations/{posts,images,videos,articles}/:id`. The route
 * names the content, so the body only picks the evaluation type.
 */
export class EvaluateContentDto {
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
