import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Length, Matches } from 'class-validator';

const SAFE_IDENTIFIER_PATTERN = /^[A-Za-z0-9_-]+$/;

export class ClaimPublicYoutubeClipperDto {
  @ApiPropertyOptional({
    description: 'Brand that should own the claimed Studio Clip project.',
  })
  @IsOptional()
  @IsString()
  @Length(1, 128)
  @Matches(SAFE_IDENTIFIER_PATTERN)
  readonly brandId?: string;

  @ApiProperty({
    description: 'Opaque 32-byte base64url public-tool capability.',
    maxLength: 43,
    minLength: 43,
  })
  @IsString()
  @Length(43, 43)
  @Matches(SAFE_IDENTIFIER_PATTERN)
  readonly previewToken!: string;
}
