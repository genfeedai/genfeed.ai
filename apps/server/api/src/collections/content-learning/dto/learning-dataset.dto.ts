import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
export class LearningDatasetSourceAccountDto {
  @IsString() @MinLength(1) @MaxLength(256) organizationId!: string;
  @IsString() @MinLength(1) @MaxLength(256) accountId!: string;
}
export class LearningDatasetDto {
  @IsString() @MaxLength(2000) rightsStatement!: string;
  @IsIn([
    'awareness',
    'engagement',
    'authority-proxy',
    'conversion-click',
    'retention-watch',
  ])
  profile!: string;
  @IsString() @MaxLength(256) cell!: string;
  @IsISO8601() cutoff!: string;
  @IsUUID() requestId!: string;
  @IsOptional() @IsArray() @ArrayMaxSize(100000) rows?: unknown[];
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => LearningDatasetSourceAccountDto)
  sourceAccounts?: LearningDatasetSourceAccountDto[];
}
