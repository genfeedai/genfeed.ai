import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
} from 'class-validator';

export class PromoteWinnersDto {
  @ApiProperty({ description: 'Brand to promote winners for' })
  @IsString()
  @MinLength(1)
  brandId!: string;

  @ApiPropertyOptional({
    description: 'Max winners to promote (default 5, max 20)',
    maximum: 20,
    minimum: 1,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  limit?: number;

  @ApiPropertyOptional({
    description: 'Optional platform filter (product lowercase id)',
  })
  @IsOptional()
  @IsString()
  platform?: string;
}
