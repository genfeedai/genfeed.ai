import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsUrl } from 'class-validator';

export class WebsitePreviewDto {
  @IsString()
  @IsNotEmpty()
  @IsUrl(
    { require_protocol: true, protocols: ['http', 'https'] },
    { message: 'websiteUrl must be an absolute http(s) URL' },
  )
  @ApiProperty({
    description: 'Public website URL to scrape for brand create prefill',
    example: 'https://acme.com',
  })
  readonly websiteUrl!: string;
}
