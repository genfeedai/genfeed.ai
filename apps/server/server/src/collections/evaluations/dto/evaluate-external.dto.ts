import { ExternalPlatform } from '@genfeedai/enums';
import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsUrl } from 'class-validator';

export class EvaluateExternalDto {
  @ApiProperty({
    description: 'External content URL to analyze',
    example: 'https://www.tiktok.com/@user/video/1234567890',
  })
  @IsUrl()
  url!: string;

  @ApiProperty({
    description: 'Platform where content is hosted',
    enum: ExternalPlatform,
    enumName: 'ExternalPlatform',
  })
  @IsEnum(ExternalPlatform)
  platform!: ExternalPlatform;
}
