import { ReplyLength, ReplyTone } from '@genfeedai/enums';
import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class OutreachCampaignAiConfigDto {
  @IsEnum(ReplyTone)
  @IsOptional()
  @ApiProperty({
    default: ReplyTone.FRIENDLY,
    description: 'Tone for AI-generated replies',
    enum: ReplyTone,
    enumName: 'ReplyTone',
    required: false,
  })
  tone?: ReplyTone;

  @IsEnum(ReplyLength)
  @IsOptional()
  @ApiProperty({
    default: ReplyLength.MEDIUM,
    description: 'Preferred length of replies',
    enum: ReplyLength,
    enumName: 'ReplyLength',
    required: false,
  })
  length?: ReplyLength;

  @IsString()
  @MaxLength(1000)
  @IsOptional()
  @ApiProperty({
    description: 'Custom instructions for AI reply generation',
    example: 'Always mention our product name and include a call to action',
    required: false,
  })
  customInstructions?: string;

  @IsString()
  @MaxLength(2000)
  @IsOptional()
  @ApiProperty({
    description: 'Context about your brand/product for AI to use',
    example:
      'We are a SaaS startup that helps content creators grow their audience',
    required: false,
  })
  context?: string;

  @IsString()
  @MaxLength(500)
  @IsOptional()
  @ApiProperty({
    description: 'CTA link to include in replies',
    example: 'https://genfeed.ai',
    required: false,
  })
  ctaLink?: string;

  @IsBoolean()
  @IsOptional()
  @ApiProperty({
    default: true,
    description: 'Whether to use AI for reply generation',
    required: false,
  })
  useAiGeneration?: boolean;

  @IsString()
  @MaxLength(500)
  @IsOptional()
  @ApiProperty({
    description: 'Template text to use if not using AI generation',
    required: false,
  })
  templateText?: string;
}
