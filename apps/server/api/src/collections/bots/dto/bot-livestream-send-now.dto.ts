import { BotPlatform } from '@genfeedai/enums';
import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

const LIVESTREAM_PLATFORMS = [BotPlatform.TWITCH, BotPlatform.YOUTUBE] as const;

export class BotLivestreamSendNowDto {
  @IsEnum(LIVESTREAM_PLATFORMS)
  @ApiProperty({
    description: 'Platform that should receive the one-off message',
    enum: LIVESTREAM_PLATFORMS,
    enumName: 'LivestreamPlatform',
  })
  platform!: (typeof LIVESTREAM_PLATFORMS)[number];

  @IsString()
  @IsOptional()
  @MaxLength(500)
  @ApiProperty({
    description:
      'Exact message to post immediately. If omitted, the service will generate one.',
    required: false,
  })
  message?: string;

  @IsString()
  @IsOptional()
  @MaxLength(64)
  @ApiProperty({
    description: 'Preferred generated message type for one-off sends',
    example: 'scheduled_link_drop',
    required: false,
  })
  type?:
    | 'scheduled_link_drop'
    | 'scheduled_host_prompt'
    | 'context_aware_question';
}
