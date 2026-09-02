import { ApiProperty } from '@nestjs/swagger';
import {
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class AddEntryDto {
  @ApiProperty({
    description: 'Content to add to the context',
  })
  @IsString()
  content!: string;

  @ApiProperty({
    description: 'Additional metadata for the entry',
    required: false,
  })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;

  @ApiProperty({
    default: 1.0,
    description: 'Relevance weight for this entry (0.0 - 1.0)',
    maximum: 1,
    minimum: 0,
    required: false,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  relevanceWeight?: number;
}
