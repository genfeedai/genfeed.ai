import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class BotResponseTemplateDto {
  @IsString()
  @MaxLength(512)
  @ApiProperty({
    description: 'Trigger phrase or intent that activates this response',
    example: 'how do I get started? ',
  })
  trigger!: string;

  @IsString()
  @MaxLength(1000)
  @ApiProperty({
    description: 'Response the bot should send when the trigger matches',
    example: 'Hey there! To get started with Genfeed... ',
  })
  response!: string;
}

export class BotSettingsDto {
  @IsInt()
  @Min(0)
  @Max(60)
  @IsOptional()
  @ApiProperty({
    default: 10,
    description: 'Maximum number of messages per minute',
    maximum: 60,
    minimum: 0,
    required: false,
  })
  messagesPerMinute?: number = 10;

  @IsInt()
  @Min(0)
  @Max(3600)
  @IsOptional()
  @ApiProperty({
    default: 5,
    description: 'Delay in seconds between receiving a message and responding',
    maximum: 3600,
    minimum: 0,
    required: false,
  })
  responseDelaySeconds?: number = 5;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  @ApiProperty({
    description: 'Keywords or intents that should trigger the bot',
    required: false,
    type: [String],
  })
  triggers?: string[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BotResponseTemplateDto)
  @IsOptional()
  @ApiProperty({
    description: 'Response templates the bot can use',
    required: false,
    type: [BotResponseTemplateDto],
  })
  responses?: BotResponseTemplateDto[];
}
