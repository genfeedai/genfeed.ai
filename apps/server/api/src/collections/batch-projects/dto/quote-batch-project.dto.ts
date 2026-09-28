import { BATCH_PROJECT_MAX_IDEAS } from '@api/collections/batch-projects/dto/add-batch-project-items.dto';
import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsOptional,
  IsString,
} from 'class-validator';

export class QuoteBatchProjectDto {
  @ApiPropertyOptional({
    description:
      'Failed ideas to price for a retry; omit to price every pending idea',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(BATCH_PROJECT_MAX_IDEAS)
  @IsString({ each: true })
  readonly itemIds?: string[];
}
