import { IsIn, IsOptional } from 'class-validator';

export class PreparePublicMediaDto {
  @IsIn(['public-share', 'public-og'])
  purpose!: 'public-share' | 'public-og';
}

export class PublicMediaGrantQueryDto {
  @IsOptional()
  @IsIn(['public-share', 'public-og'])
  purpose?: 'public-share' | 'public-og';
}
