import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsMongoId, IsNumber, IsOptional } from 'class-validator';
import { Types } from 'mongoose';

export enum Platform {
  TIKTOK = 'tiktok',
  INSTAGRAM = 'instagram',
  LINKEDIN = 'linkedin',
  TWITTER = 'twitter',
  YOUTUBE = 'youtube',
  REDDIT = 'reddit',
  PINTEREST = 'pinterest',
}

export class GenerateTrendIdeasDto {
  @ApiProperty({
    description: 'Social media platform to generate trend ideas for',
    enum: Platform,
    enumName: 'TrendPlatform',
    required: false,
  })
  @IsEnum(Platform)
  @IsOptional()
  platform?: Platform;

  @ApiProperty({
    description: 'Maximum number of trend ideas to generate',
    minimum: 1,
    required: false,
  })
  @IsNumber()
  @IsOptional()
  limit?: number;

  @ApiProperty({
    description: 'Organization ID',
    required: false,
  })
  @IsMongoId()
  @IsOptional()
  organizationId?: Types.ObjectId;

  @ApiProperty({
    description: 'Brand ID to generate trend ideas for',
    required: false,
  })
  @IsMongoId()
  @IsOptional()
  brandId?: Types.ObjectId;
}

export interface TrendIdea {
  title: string;
  description: string;
  platform: string;
  contentType: 'video' | 'image' | 'carousel' | 'thread' | 'text';
  estimatedViews?: number;
  hashtags?: string[];
  caption?: string;
}

export interface TrendWithIdeas {
  trend: {
    platform: string;
    topic: string;
    viralityScore: number;
    mentions: number;
    growthRate: number;
    requiresAuth: boolean;
  };
  ideas: TrendIdea[];
}
