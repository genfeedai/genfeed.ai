import type { ITemplateVariable } from '@api/collections/templates/schemas/template.schema';
import {
  AssetScope,
  TemplateCategory,
  TemplateDifficulty,
} from '@genfeedai/enums';
import { ApiProperty } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
} from 'class-validator';

export interface ITemplateMetadataDto {
  estimatedTime?: number;
  difficulty?: TemplateDifficulty;
  goals?: string[];
  version?: string;
  author?: string;
  license?: string;
  requiredFeatures?: string[];
  compatiblePlatforms?: string[];
}

export class CreateTemplateDto {
  @ApiProperty({
    description:
      'Unique key for prompt templates (e.g., "article.generate.default")',
    required: false,
  })
  @IsOptional()
  @IsString()
  key?: string;

  @ApiProperty({
    description:
      'Template purpose: content (user-facing) or prompt (system-level)',
    enum: ['content', 'prompt'],
    required: true,
  })
  @IsEnum(['content', 'prompt'])
  purpose!: 'content' | 'prompt';

  @ApiProperty({
    description: 'Unified category for both content and prompt templates',
    enum: TemplateCategory,
    enumName: 'TemplateCategory',
    required: false,
  })
  @IsOptional()
  @IsEnum(TemplateCategory)
  category?: TemplateCategory;

  @ApiProperty({
    description: 'Label of the template',
    required: true,
  })
  @IsString()
  label!: string;

  @ApiProperty({
    description: 'Description of the template',
    required: true,
  })
  @IsString()
  description!: string;

  @ApiProperty({
    description: 'Template content with {{variables}}',
    required: true,
  })
  @IsString()
  content!: string;

  @ApiProperty({
    description: 'Template variables',
    required: false,
  })
  @IsOptional()
  @IsArray()
  @IsObject({ each: true })
  variables?: ITemplateVariable[];

  @ApiProperty({
    description: 'Template categories',
    required: false,
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  categories?: string[];

  @ApiProperty({
    description: 'Industries',
    required: false,
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  industries?: string[];

  @ApiProperty({
    description: 'Platforms',
    required: false,
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  platforms?: string[];

  @ApiProperty({
    description: 'Tags',
    required: false,
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @ApiProperty({
    description: 'Asset scope',
    enum: AssetScope,
    enumName: 'AssetScope',
    required: false,
  })
  @IsOptional()
  @IsEnum(AssetScope)
  scope?: AssetScope;

  @ApiProperty({
    description: 'Template version (for prompt templates)',
    required: false,
  })
  @IsOptional()
  @IsNumber()
  version?: number;

  @ApiProperty({
    description: 'Whether template is active (for prompt templates)',
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiProperty({
    description: 'Template metadata properties',
    required: false,
  })
  @IsOptional()
  @IsObject()
  metadata?: ITemplateMetadataDto;
}
