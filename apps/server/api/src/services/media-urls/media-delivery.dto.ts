import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
} from 'class-validator';

export class PrepareMediaPreviewsDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  ids!: string[];
}

export class PreparePublicMediaDto {
  @IsIn(['public-share', 'public-og'])
  purpose!: 'public-share' | 'public-og';
}

export class PublicMediaGrantQueryDto {
  @IsOptional()
  @IsIn(['public-share', 'public-og'])
  purpose?: 'public-share' | 'public-og';
}
