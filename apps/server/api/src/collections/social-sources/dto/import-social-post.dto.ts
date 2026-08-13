import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsUrl, MaxLength } from 'class-validator';

export class ImportSocialPostDto {
  @IsString()
  @IsNotEmpty()
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  @MaxLength(512)
  @ApiProperty({
    description: 'Public X, Instagram, or TikTok post URL to import',
    maxLength: 512,
  })
  url!: string;
}
