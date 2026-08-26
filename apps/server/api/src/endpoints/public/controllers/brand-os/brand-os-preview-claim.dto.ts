import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length, Matches } from 'class-validator';

export class BrandOsPreviewClaimDto {
  @ApiProperty({
    description: 'Opaque 32-byte base64url preview bearer token.',
    minLength: 43,
    maxLength: 43,
  })
  @IsString()
  @Length(43, 43)
  @Matches(/^[A-Za-z0-9_-]+$/)
  readonly previewToken!: string;
}
