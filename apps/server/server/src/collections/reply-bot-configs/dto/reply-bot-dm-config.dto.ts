import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class ReplyBotDmConfigDto {
  @IsBoolean()
  @IsOptional()
  @ApiProperty({
    default: false,
    description: 'Whether DM sending is enabled',
    required: false,
  })
  enabled?: boolean;

  @IsString()
  @MaxLength(1000)
  @IsOptional()
  @ApiProperty({
    description:
      'DM template with variable support (e.g., {username}, {tweet_url})',
    example:
      'Hey {username}! Thanks for engaging with my tweet. Check out my newsletter: ...',
    required: false,
  })
  template?: string;

  @IsBoolean()
  @IsOptional()
  @ApiProperty({
    default: true,
    description: 'Use AI to generate personalized DM instead of template',
    required: false,
  })
  useAiGeneration?: boolean;

  @IsNumber()
  @Min(0)
  @Max(3600)
  @IsOptional()
  @ApiProperty({
    default: 60,
    description: 'Delay in seconds before sending DM after reply',
    maximum: 3600,
    minimum: 0,
    required: false,
  })
  delaySeconds?: number;

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
    example: 'Keep it casual and mention the free trial',
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
