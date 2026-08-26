import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Length, Matches } from 'class-validator';

export class ClaimPublicYoutubeClipDto {
  @ApiPropertyOptional({
    description: 'Brand that should own the claimed Studio Clip project.',
  })
  @IsOptional()
  @IsString()
  @Length(1, 128)
  @Matches(/^[A-Za-z0-9_-]+$/)
  readonly brandId?: string;

  @ApiProperty({
    description: 'Opaque 32-byte base64url public-tool capability.',
    maxLength: 43,
    minLength: 43,
  })
  @IsString()
  @Length(43, 43)
  @Matches(/^[A-Za-z0-9_-]+$/)
  readonly previewToken!: string;
}
