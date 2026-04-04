import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class DownloadSkillDto {
  @IsString()
  @ApiProperty({
    description: 'Receipt ID for download authorization (format: sk_rcpt_<id>)',
  })
  readonly receiptId!: string;

  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'Skill slug to download (required for bundle receipts)',
    required: false,
  })
  readonly skillSlug?: string;
}
