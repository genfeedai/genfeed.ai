import {
  LIBRARY_ELEMENT_KINDS,
  type LibraryElementKind,
} from '@genfeedai/contracts';
import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class LibraryElementsQueryDto {
  @IsOptional()
  @IsArray()
  @IsIn(LIBRARY_ELEMENT_KINDS, { each: true })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.split(',').filter(Boolean) : value,
  )
  @ApiProperty({
    description: 'Comma-separated kinds: CHARACTER, LOCATION, STYLE, PROP',
    required: false,
    type: [String],
  })
  readonly kind?: LibraryElementKind[];

  @IsOptional()
  @IsString()
  @ApiProperty({ description: 'Match on name or handle', required: false })
  readonly q?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @ApiProperty({ default: 1, required: false })
  readonly page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @ApiProperty({ default: 24, required: false })
  readonly limit: number = 24;
}
