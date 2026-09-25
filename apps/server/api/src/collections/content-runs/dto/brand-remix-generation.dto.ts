import {
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class QuoteBrandRemixGenerationDto {
  @IsInt()
  @Min(1)
  expectedRevision!: number;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  model?: string;
}

export class ExecuteBrandRemixGenerationDto {
  @IsInt()
  @Min(1)
  expectedRevision!: number;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  quoteId!: string;
}
