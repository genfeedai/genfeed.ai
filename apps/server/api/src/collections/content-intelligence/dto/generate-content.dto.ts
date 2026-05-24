import { IsEntityId } from '@api/helpers/validation/entity-id.validator';
import {
  ContentIntelligencePlatform,
  ContentPatternType,
  TemplateCategory,
} from '@genfeedai/enums';
import { ApiProperty } from '@nestjs/swagger';
import {
  IsArray,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class GenerateContentDto {
  @IsEnum(ContentIntelligencePlatform)
  @ApiProperty({
    description: 'Target platform for the generated content',
    enum: ContentIntelligencePlatform,
    enumName: 'ContentIntelligencePlatform',
  })
  platform!: ContentIntelligencePlatform;

  @IsString()
  @MaxLength(2000)
  @ApiProperty({
    description: 'Topic or subject for the content',
    example: 'Building a personal brand on LinkedIn',
  })
  topic!: string;

  @IsOptional()
  @IsEnum(ContentPatternType)
  @ApiProperty({
    description: 'Type of pattern to use for generation',
    enum: ContentPatternType,
    enumName: 'ContentPatternType',
    required: false,
  })
  patternType?: ContentPatternType;

  @IsOptional()
  @IsEnum(TemplateCategory)
  @ApiProperty({
    description: 'Template category to use',
    enum: TemplateCategory,
    enumName: 'TemplateCategory',
    required: false,
  })
  templateCategory?: TemplateCategory;

  @IsOptional()
  @IsEntityId()
  @ApiProperty({
    description: 'Specific pattern ID to use for generation',
    required: false,
  })
  patternId?: string;

  @IsOptional()
  @IsEntityId()
  @ApiProperty({
    description: 'Playbook ID to use for generation guidelines',
    required: false,
  })
  playbookId?: string;

  @IsOptional()
  @IsEntityId()
  @ApiProperty({
    description: 'Brand ID to apply brand voice',
    required: false,
  })
  brandId?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(5)
  @ApiProperty({
    default: 3,
    description: 'Number of content variations to generate',
    maximum: 5,
    minimum: 1,
    required: false,
  })
  variationsCount?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ApiProperty({
    description: 'Additional context or instructions',
    required: false,
    type: [String],
  })
  additionalContext?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ApiProperty({
    description: 'Hashtags to include in the content',
    required: false,
    type: [String],
  })
  hashtags?: string[];
}
