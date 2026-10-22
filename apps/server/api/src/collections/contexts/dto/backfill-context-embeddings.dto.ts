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
  @Matches(/\S/)
  @MaxLength(200)
  cursor?: string;
}
