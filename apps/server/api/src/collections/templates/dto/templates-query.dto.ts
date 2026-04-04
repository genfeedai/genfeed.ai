import { AssetScope, TemplateCategory } from '@genfeedai/enums';
import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';

export class TemplatesQueryDto {
  @ApiProperty({
    description: 'Filter by template purpose',
    enum: ['content', 'prompt'],
    required: false,
  })
  @IsOptional()
  @IsEnum(['content', 'prompt'])
  purpose?: 'content' | 'prompt';

  @ApiProperty({
    description: 'Filter by prompt template key',
    required: false,
  })
  @IsOptional()
  @IsString()
  key?: string;

  @ApiProperty({
    description: 'Filter by unified category',
    enum: TemplateCategory,
    enumName: 'TemplateCategory',
    required: false,
  })
  @IsOptional()
  @IsEnum(TemplateCategory)
  category?: TemplateCategory;

  @ApiProperty({
    description: 'Filter by industry',
    required: false,
  })
  @IsOptional()
  @IsString()
  industry?: string;

  @ApiProperty({
    description: 'Filter by platform',
    required: false,
  })
  @IsOptional()
  @IsString()
  platform?: string;

  @ApiProperty({
    description: 'Filter by scope',
    enum: AssetScope,
    enumName: 'AssetScope',
    required: false,
  })
  @IsOptional()
  @IsEnum(AssetScope)
  scope?: AssetScope;

  @ApiProperty({
    description: 'Filter by featured status',
    required: false,
  })
  @IsOptional()
  @IsString()
  isFeatured?: string;

  @ApiProperty({
    description: 'Search query',
    required: false,
  })
  @IsOptional()
  @IsString()
  search?: string;
}
