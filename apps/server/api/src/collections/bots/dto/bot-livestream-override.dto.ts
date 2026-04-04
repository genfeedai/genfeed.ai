import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class BotLivestreamOverrideDto {
  @IsString()
  @IsOptional()
  @MaxLength(280)
  @ApiProperty({
    description: 'Override topic used for context-aware prompts',
    required: false,
  })
  topic?: string;

  @IsString()
  @IsOptional()
  @MaxLength(280)
  @ApiProperty({
    description: 'Optional promotion angle layered into generated prompts',
    required: false,
  })
  promotionAngle?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'Optional active link override for the next drop',
    required: false,
  })
  activeLinkId?: string;
}
