import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

/**
 * One Restream Chat WS action (server → client). Shape is intentionally loose
 * because Restream event envelopes vary by source platform.
 * @see https://developers.restream.io/chat/getting-started
 */
export class RestreamChatActionDto {
  @IsString()
  @IsOptional()
  @MaxLength(120)
  @ApiProperty({ required: false })
  action?: string;

  @IsObject()
  @IsOptional()
  @ApiProperty({ required: false, additionalProperties: true, type: Object })
  author?: Record<string, unknown>;

  @IsObject()
  @IsOptional()
  @ApiProperty({ required: false, additionalProperties: true, type: Object })
  payload?: Record<string, unknown>;

  @IsObject()
  @IsOptional()
  @ApiProperty({ required: false, additionalProperties: true, type: Object })
  eventPayload?: Record<string, unknown>;

  @IsString()
  @IsOptional()
  @MaxLength(4000)
  @ApiProperty({ required: false })
  text?: string;
}

export class BotLivestreamRestreamChatIngestDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RestreamChatActionDto)
  @ApiProperty({
    description:
      'Batch of Restream Chat WebSocket actions to ingest as context',
    type: [RestreamChatActionDto],
  })
  actions!: RestreamChatActionDto[];
}
