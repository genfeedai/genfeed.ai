import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
export class BrandedGenerationReceiptListQueryDto {
  @Type(() => Number) @IsInt() @Min(1) @Max(10) limit = 10;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(2112) cursor?: string;
}
export class BrandedGenerationReceiptHistoryQueryDto {
  @Type(() => Number) @IsInt() @Min(1) @Max(10) limit = 10;
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(2147483647)
  afterRevision?: number;
}
export class BrandedGenerationPromptInspectionQueryDto {
  @Type(() => Number) @IsInt() @Min(0) @Max(2147483647) revision!: number;
}
export class BrandedGenerationReceiptEmptyQueryDto {}
