import { IsOptional, IsString, Matches } from 'class-validator';

const BASE64_PATTERN = /^[A-Za-z0-9+/]+={0,2}$/;

export class UploadDesktopAssetDto {
  @IsString()
  @Matches(BASE64_PATTERN)
  data!: string;

  @IsString()
  @IsOptional()
  mimeType?: string;

  @IsString()
  @IsOptional()
  originalFileName?: string;
}
