import { IsEnum, IsOptional, IsString } from 'class-validator';

export class GetOptimalTimeDto {
  @IsEnum(['instagram', 'tiktok', 'youtube', 'linkedin', 'twitter', 'facebook'])
  platform!: string;

  @IsOptional()
  @IsString()
  brandId?: string;

  @IsOptional()
  @IsString()
  credentialId?: string;

  @IsOptional()
  @IsString()
  timezone?: string; // IANA name of the account timezone. Default: 'UTC'
}
