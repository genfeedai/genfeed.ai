import { IsOptional, IsString } from 'class-validator';

export class DesktopBrandManifestQueryDto {
  @IsString()
  @IsOptional()
  brandId?: string;

  @IsString()
  @IsOptional()
  cursor?: string;
}
