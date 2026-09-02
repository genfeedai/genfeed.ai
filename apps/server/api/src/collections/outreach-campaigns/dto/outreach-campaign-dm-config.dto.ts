import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class OutreachCampaignDmConfigDto {
  @IsBoolean()
  @IsOptional()
  @ApiProperty({
    default: true,
    description: 'Whether to use AI for DM generation',
    required: false,
  })
  useAiGeneration?: boolean;

  @IsString()
  @MaxLength(1000)
  @IsOptional()
  @ApiProperty({
    description:
      'Template text for DMs. Supports {{username}}, {{offer}}, {{cta}}',
    required: false,
  })
  templateText?: string;

  @IsString()
  @MaxLength(2000)
  @IsOptional()
  @ApiProperty({
    description: 'Context about what you are selling or promoting',
    example: 'Selling genfeed.ai/skills — AI content creation skills',
    required: false,
  })
  context?: string;

  @IsString()
  @MaxLength(1000)
  @IsOptional()
  @ApiProperty({
    description: 'Custom instructions for DM generation',
    required: false,
  })
  customInstructions?: string;

  @IsString()
  @MaxLength(500)
  @IsOptional()
  @ApiProperty({
    description: 'Link to include in the DM',
    example: 'https://genfeed.ai/skills',
    required: false,
  })
  ctaLink?: string;

  @IsString()
  @MaxLength(500)
  @IsOptional()
  @ApiProperty({
    description: 'The offer to promote',
    example: '30-Day Content Sprint',
    required: false,
  })
  offer?: string;
}
