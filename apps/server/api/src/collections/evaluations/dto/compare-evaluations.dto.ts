import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
} from 'class-validator';

export class CompareEvaluationsDto {
  @ApiProperty({
    description: 'Evaluation IDs to compare',
    example: ['evaluation-1', 'evaluation-2'],
    maxItems: 20,
    minItems: 2,
    type: [String],
  })
  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(20)
  @IsString({ each: true })
  evaluationIds!: string[];

  @ApiPropertyOptional({
    default: false,
    description: 'Allow comparison before every evaluation is completed',
  })
  @IsOptional()
  @IsBoolean()
  includeIncomplete?: boolean;
}
