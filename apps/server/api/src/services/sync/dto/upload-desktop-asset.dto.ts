import { IsOptional, IsString, Matches } from 'class-validator';

export class UploadDesktopAssetDto {
  @IsString()
  @Matches(/^[A-Za-z0-9+/]+={0,2}$/)
  data!: string;

  @IsString()
  @IsOptional()
  mimeType?: string;

  @IsString()
  @IsOptional()
  originalFileName?: string;
}
