import { IsEntityId } from '@api/helpers/validation/entity-id.validator';
import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';

export class CreateContextDto {
  @ApiProperty({
    description: 'Label of the context',
  })
  @IsString()
  label!: string;

  @ApiProperty({
    description: 'Description of the context',
  })
  @IsString()
  description!: string;

  @ApiProperty({
    description: 'Type of context',
    enum: ['brand_voice', 'content_library', 'audience', 'custom'],
  })
  @IsEnum(['brand_voice', 'content_library', 'audience', 'custom'])
  type!: 'brand_voice' | 'content_library' | 'audience' | 'custom';

  @ApiProperty({
    description: 'Source of the context',
    enum: ['onboarding', 'manual', 'auto-generated'],
    required: false,
  })
  @IsOptional()
  @IsString()
  source?: string;

  @ApiProperty({
    description: 'Source URL if applicable',
    required: false,
  })
  @IsOptional()
  @IsString()
  sourceUrl?: string;

  @ApiProperty({
    description: 'Brand ID if created from brand',
    required: false,
  })
  @IsOptional()
  @IsEntityId()
  sourceBrand?: string;

  @ApiProperty({
    description: 'Last analyzed timestamp',
    required: false,
  })
  @IsOptional()
  lastAnalyzed?: Date;
}
