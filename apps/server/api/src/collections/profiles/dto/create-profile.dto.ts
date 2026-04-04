import type {
  IArticleProfile,
  IImageProfile,
  IVideoProfile,
  IVoiceProfile,
} from '@api/collections/profiles/schemas/profile.schema';
import {
  IsArray,
  IsBoolean,
  IsObject,
  IsOptional,
  IsString,
} from 'class-validator';

export class CreateProfileDto {
  @IsString()
  label!: string;

  @IsString()
  description!: string;

  @IsOptional()
  @IsObject()
  image?: IImageProfile;

  @IsOptional()
  @IsObject()
  video?: IVideoProfile;

  @IsOptional()
  @IsObject()
  voice?: IVoiceProfile;

  @IsOptional()
  @IsObject()
  article?: IArticleProfile;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @IsOptional()
  @IsObject()
  metadata?: {
    brandGuidelines?: string;
    targetAudience?: string;
    exampleContent?: string[];
  };
}
