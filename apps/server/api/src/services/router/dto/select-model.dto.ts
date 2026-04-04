import { ModelCategory, RouterPriority } from '@genfeedai/enums';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class DimensionsDto {
  @IsNumber()
  @IsOptional()
  @ApiProperty({
    description: 'Width in pixels',
    example: 1920,
    required: false,
  })
  readonly width?: number;

  @IsNumber()
  @IsOptional()
  @ApiProperty({
    description: 'Height in pixels',
    example: 1080,
    required: false,
  })
  readonly height?: number;
}

export class SelectModelDto {
  @IsString()
  @IsNotEmpty()
  @ApiProperty({
    description: 'The user prompt for content generation',
    example: 'A futuristic city at sunset with flying cars',
  })
  readonly prompt!: string;

  @IsEnum(ModelCategory)
  @IsNotEmpty()
  @ApiProperty({
    description: 'The category of content to generate',
    enum: ModelCategory,
    enumName: 'ModelCategory',
    example: ModelCategory.IMAGE,
  })
  readonly category!: ModelCategory;

  @IsEnum(RouterPriority)
  @IsOptional()
  @ApiProperty({
    default: RouterPriority.BALANCED,
    description: 'Optimization priority for model selection',
    enum: RouterPriority,
    enumName: 'RouterPriority',
    required: false,
  })
  readonly prioritize?: RouterPriority;

  @IsObject()
  @IsOptional()
  @ValidateNested()
  @Type(() => DimensionsDto)
  @ApiProperty({
    description: 'Dimensions for image/video generation',
    required: false,
    type: DimensionsDto,
  })
  readonly dimensions?: DimensionsDto;

  @IsNumber()
  @IsOptional()
  @Min(4)
  @Max(60)
  @ApiProperty({
    description: 'Duration in seconds for video generation',
    example: 10,
    maximum: 60,
    minimum: 4,
    required: false,
  })
  readonly duration?: number;

  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'Speech text for video generation',
    required: false,
  })
  readonly speech?: string;

  @IsNumber()
  @IsOptional()
  @Min(1)
  @Max(4)
  @ApiProperty({
    default: 1,
    description: 'Number of outputs to generate',
    maximum: 4,
    minimum: 1,
    required: false,
  })
  readonly outputs?: number;
}
