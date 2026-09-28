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
      'The failed idea to price for a retry (one at a time: each retry accepts its own quote); omit to price every pending idea',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(1)
  @IsString({ each: true })
  readonly itemIds?: string[];
}
