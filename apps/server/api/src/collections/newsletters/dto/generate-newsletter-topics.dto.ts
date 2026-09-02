import { ApiProperty } from '@nestjs/swagger';
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class GenerateNewsletterTopicsDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  @ApiProperty({
    description: 'Optional extra planning instructions',
    required: false,
  })
  instructions?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(8)
  @ApiProperty({
    default: 5,
    description: 'Number of proposals to return',
    required: false,
  })
  count?: number;
}
