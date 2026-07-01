import {
  ArrayMaxSize,
  IsArray,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

export class CrawlBrandKitDto {
  @IsString()
  @MinLength(1)
  url!: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @IsString({ each: true })
  socialUrls?: string[];
}
