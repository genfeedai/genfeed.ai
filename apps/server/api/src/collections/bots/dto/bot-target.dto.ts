import { BotPlatform } from '@genfeedai/enums';
import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsMongoId,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class BotTargetDto {
  @IsEnum(BotPlatform)
  @ApiProperty({
    description: 'Platform this bot target applies to',
    enum: BotPlatform,
    enumName: 'BotPlatform',
  })
  platform!: BotPlatform;

  @IsString()
  @MaxLength(256)
  @ApiProperty({
    description: 'Identifier of the channel or account the bot targets',
    example: 'UC123456789',
  })
  channelId!: string;

  @IsString()
  @IsOptional()
  @MaxLength(256)
  @ApiProperty({
    description: 'Human readable label for the target channel/account',
    example: 'Genfeed Official YouTube',
    required: false,
  })
  channelLabel?: string;

  @IsString()
  @IsOptional()
  @MaxLength(256)
  @ApiProperty({
    description: 'URL pointing to the channel/profile',
    required: false,
  })
  channelUrl?: string;

  @IsMongoId()
  @IsOptional()
  @ApiProperty({
    description: 'Credential used to post to this livestream target',
    required: false,
  })
  credentialId?: string;

  @IsString()
  @IsOptional()
  @MaxLength(256)
  @ApiProperty({
    description: 'Resolved live chat identifier for YouTube Live',
    required: false,
  })
  liveChatId?: string;

  @IsString()
  @IsOptional()
  @MaxLength(256)
  @ApiProperty({
    description: 'Optional sender ID for Twitch chat delivery',
    required: false,
  })
  senderId?: string;

  @IsBoolean()
  @IsOptional()
  @ApiProperty({
    default: true,
    description: 'Whether this target is currently active',
    required: false,
  })
  isEnabled?: boolean = true;
}
