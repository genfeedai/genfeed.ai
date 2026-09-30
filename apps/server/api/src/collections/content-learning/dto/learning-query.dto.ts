import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
export class LearningQueryDto {
  @IsOptional() @IsString() @MaxLength(256) brandId?: string;
  @IsOptional()
  @IsIn(['text', 'image', 'carousel', 'video', 'short', 'thread'])
  format?: string;
  @IsOptional()
  @IsIn([
    'awareness',
    'engagement',
    'authority-proxy',
    'conversion-click',
    'retention-watch',
  ])
  objective?: string;
  @IsOptional() @IsInt() @Min(1) @Max(100) limit = 20;
  @IsOptional() @IsInt() @Min(1) @Max(100) page = 1;
}
