import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class DownloadSkillDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  @ApiProperty({
    description: 'Receipt ID for download authorization (format: sk_rcpt_<id>)',
  })
  readonly receiptId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  @ApiProperty({
    description: 'Entitled skill slug to download or install',
  })
  readonly skillSlug!: string;
}
