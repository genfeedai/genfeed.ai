import { IsOptional, IsString } from 'class-validator';

export class RequestDesktopAssetUploadDto {
  @IsString()
  assetId!: string;

  @IsString()
  @IsOptional()
  mimeType?: string;

  @IsString()
  @IsOptional()
  originalFileName?: string;
}
