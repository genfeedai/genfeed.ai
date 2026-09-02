import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

export class QueryContextDto {
  @ApiProperty({
    description: 'Search query to find relevant context',
  })
  @IsString()
  query!: string;

  @ApiProperty({
    description: 'Context base ID to search within',
  })
  @IsString()
  contextBaseId!: string;

  @ApiProperty({
    default: 10,
    description: 'Maximum number of results to return (1-20)',
    maximum: 20,
    minimum: 1,
    required: false,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(20)
  limit?: number;

  @ApiProperty({
    default: 0.7,
    description: 'Minimum similarity score threshold (0.0 - 1.0)',
    maximum: 1,
    minimum: 0,
    required: false,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  minRelevance?: number;
}
