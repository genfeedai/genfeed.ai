import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

const NON_WHITESPACE_CHAR_PATTERN = /\S/;

export class BackfillContextEmbeddingsDto {
  @ApiProperty({ minimum: 1, maximum: 200 })
  @IsInt()
  @Min(1)
  @Max(200)
  maxEntries!: number;

  @ApiPropertyOptional({ maxLength: 200 })
  @ValidateIf(
    (_object: BackfillContextEmbeddingsDto, value: unknown) =>
      value !== undefined,
  )
  @IsString()
  @Matches(NON_WHITESPACE_CHAR_PATTERN)
  @MaxLength(200)
  cursor?: string;
}
