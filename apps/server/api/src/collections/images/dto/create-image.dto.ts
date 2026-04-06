import { CreateIngredientDto } from '@api/collections/ingredients/dto/create-ingredient.dto';
import { CreateMetadataDto } from '@api/collections/metadata/dto/create-metadata.dto';
import { MODEL_KEYS } from '@genfeedai/constants';
import { RouterPriority } from '@genfeedai/enums';
import { ApiProperty, OmitType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

export class CreateImageDto extends OmitType(CreateIngredientDto, [
  'metadata',
]) {
  @IsString()
  @IsOptional()
  @ApiProperty({
    default: 'realistic',
    description: 'The artistic style for the image generation',
  })
  readonly style?: string;

  @IsNumber()
  @IsOptional()
  @ApiProperty({
    default: 1920,
    description: 'The width of the generated image in pixels',
  })
  readonly width?: number;

  @IsNumber()
  @IsOptional()
  @ApiProperty({
    default: 1080,
    description: 'The height of the generated image in pixels',
  })
  readonly height?: number;

  @IsNumber()
  @IsOptional()
  @ApiProperty({
    default: 1,
    description: 'Number of images to generate',
  })
  readonly outputs?: number;

  @IsString()
  @IsOptional()
  @ApiProperty({
    default: MODEL_KEYS.REPLICATE_OPENAI_GPT_IMAGE_1_5,
    description:
      'The model to use for image generation. Can be a ModelKey enum value or a custom model path (e.g., Replicate destination or training model ID).',
  })
  readonly model?: string;

  @IsBoolean()
  @IsOptional()
  @ApiProperty({
    default: false,
    description:
      'Automatically select the best model based on the prompt. If true, the model parameter will be ignored.',
    required: false,
  })
  readonly autoSelectModel?: boolean;

  @IsEnum(RouterPriority)
  @IsOptional()
  @ApiProperty({
    default: RouterPriority.BALANCED,
    description:
      'Priority for auto model routing: quality, speed, cost, or balanced.',
    enum: RouterPriority,
    enumName: 'RouterPriority',
    required: false,
  })
  readonly prioritize?: RouterPriority;

  @IsString()
  @IsOptional()
  @ApiProperty({
    default: 'landscape',
    description: 'The format for image generation',
  })
  readonly format?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'The mood for image generation',
    required: false,
  })
  readonly mood?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'The camera angle for image generation',
    required: false,
  })
  readonly camera?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'The lens type for image generation',
    required: false,
  })
  readonly lens?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'The scene for image generation',
    required: false,
  })
  readonly scene?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'The lighting for image generation',
    required: false,
  })
  readonly lighting?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'The font family for image captions/text',
    required: false,
  })
  readonly fontFamily?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  @Transform(({ value }) => {
    // Ensure blacklist is always an array
    if (value === undefined || value === null) {
      return undefined;
    }
    if (Array.isArray(value)) {
      return value;
    }
    // If it's a string, split by comma or wrap in array
    if (typeof value === 'string') {
      return value.includes(',')
        ? value.split(',').map((v) => v.trim())
        : [value];
    }
    return [value];
  })
  @ApiProperty({
    description: 'Array of blacklist element keys to exclude from generation',
    required: false,
    type: [String],
  })
  readonly blacklist?: string[];

  @IsOptional()
  @IsIn(['off', 'brand'])
  @ApiProperty({
    default: 'off',
    description: 'Brand context mode for prompt assembly',
    enum: ['off', 'brand'],
    required: false,
  })
  readonly brandingMode?: 'off' | 'brand';

  @IsBoolean()
  @IsOptional()
  @ApiProperty({
    default: true,
    description: 'Whether to include branding in the image',
    required: false,
  })
  readonly isBrandingEnabled?: boolean;

  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'Speech text for Google Veo3 models (for image-to-video)',
    required: false,
  })
  readonly speech?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => CreateMetadataDto)
  @ApiProperty({
    description: 'Optional metadata associated with the image',
    required: false,
    type: () => CreateMetadataDto,
  })
  readonly metadata?: CreateMetadataDto;

  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'Prompt template key (e.g., "image.product-ad.default")',
    required: false,
  })
  readonly promptTemplate?: string;

  @IsBoolean()
  @IsOptional()
  @ApiProperty({
    default: true,
    description: 'Whether to use prompt templates',
    required: false,
  })
  readonly useTemplate?: boolean;

  @IsBoolean()
  @IsOptional()
  @ApiProperty({
    default: false,
    description:
      'If true, wait for generation to complete before returning the result. Defaults to false (returns immediately with placeholder).',
    required: false,
  })
  readonly waitForCompletion?: boolean;
}
