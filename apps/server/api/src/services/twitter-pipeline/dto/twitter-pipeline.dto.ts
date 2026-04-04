import type {
  ITwitterSearchResult,
  ITwitterVoiceConfig,
} from '@genfeedai/interfaces';
import {
  IsArray,
  IsEnum,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class TwitterPipelineSearchDto {
  @IsString()
  brandId!: string;

  @IsString()
  query!: string;

  @IsOptional()
  @IsNumber()
  maxResults?: number;
}

export class TwitterPipelineDraftDto {
  @IsArray()
  searchResults!: ITwitterSearchResult[];

  @IsObject()
  voiceConfig!: ITwitterVoiceConfig;
}

export enum TwitterPublishType {
  REPLY = 'reply',
  QUOTE = 'quote',
  ORIGINAL = 'original',
}

export class TwitterPipelinePublishDto {
  @IsString()
  brandId!: string;

  @IsEnum(TwitterPublishType)
  type!: TwitterPublishType;

  @IsString()
  @MaxLength(280)
  text!: string;

  @IsOptional()
  @IsString()
  targetTweetId?: string;
}
