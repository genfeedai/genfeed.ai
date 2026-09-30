import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
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
  @IsString({ each: true })
  @MaxLength(256, { each: true })
  sourceAccountIds?: string[];
}
