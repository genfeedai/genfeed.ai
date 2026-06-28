import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

import { BRAND_INTERVIEW_CREDIT_COST } from '../constants/brand-interview-question-catalog.constant';

export class StartBrandInterviewDto {
  @ApiPropertyOptional({
    default: BRAND_INTERVIEW_CREDIT_COST,
    description:
      'Credits to charge for starting this interview session. Defaults to the standard cost.',
    example: BRAND_INTERVIEW_CREDIT_COST,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1000)
  creditAmount?: number;
}
