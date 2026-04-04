import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateBatchContentDto {
  @ApiProperty({
    description: 'Content skill slug to execute for each batch item',
    example: 'content-writing',
  })
  @IsString()
  @MaxLength(120)
  readonly skillSlug!: string;

  @ApiProperty({
    description: 'Number of drafts to generate in parallel',
    example: 5,
    maximum: 100,
    minimum: 1,
  })
  @IsInt()
  @Min(1)
  @Max(100)
  readonly count!: number;

  @ApiPropertyOptional({
    description: 'Optional skill parameters',
    type: Object,
  })
  @IsOptional()
  @IsObject()
  readonly params?: Record<string, unknown>;
}
