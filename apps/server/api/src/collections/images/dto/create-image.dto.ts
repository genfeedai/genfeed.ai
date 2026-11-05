import { CrunImageQuoteControlsDto } from '@api/collections/images/dto/create-crun-image-quote.dto';
import { CreateMediaGenerationDto } from '@api/collections/ingredients/dto/create-media-generation.dto';
import { CreateMetadataDto } from '@api/collections/metadata/dto/create-metadata.dto';
import { toCommaSeparatedStrings } from '@api/helpers/dto/comma-separated-strings.transform';
import { IsEntityId } from '@api/helpers/validation/entity-id.validator';
import { MODEL_KEYS } from '@genfeedai/contracts/constants';
import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateBy,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

const PRINTABLE_ASCII_ID_PATTERN = /^[\x21-\x7e]{1,256}$/;

export class CreateImageDto extends CreateMediaGenerationDto {
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @ValidateNested()
  @Type(() => CrunImageQuoteControlsDto)
  readonly crunControls?: CrunImageQuoteControlsDto;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString()
  @MaxLength(256)
  @Matches(PRINTABLE_ASCII_ID_PATTERN)
  readonly crunQuoteId?: string;

  @IsString()
  @ApiProperty({ description: 'Image generation prompt', required: true })
  readonly text!: string;

  @IsOptional()
  @IsString()
  readonly resolution?: string;

  @IsOptional()
  @IsString()
  readonly aspectRatio?: string;

  @IsOptional()
  @IsArray()
  @ValidateBy({
    name: 'imageReferenceCount',
    validator: {
      validate: (value: unknown, args) =>
        Array.isArray(value) &&
        value.length <=
          ((args?.object as CreateImageDto | undefined)?.model?.startsWith(
            'crun/',
          )
            ? 14
            : 10),
      defaultMessage: () => 'Too many selected references',
    },
  })
  @IsEntityId({ each: true })
  @ApiProperty({
    description: 'Source ingredient IDs used as image references',
    required: false,
    type: [String],
  })
  readonly references?: string[];

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
    description:
      'Native provider quality enum from the model OpenAPI schema (e.g. low, medium, high, xhigh, max, auto). Auto bills at the top band; omitted quality uses the selected model default quality.',
    required: false,
  })
  readonly quality?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({
    default: MODEL_KEYS.REPLICATE_OPENAI_GPT_IMAGE_1_5,
    description:
      'The model to use for image generation. Can be a ModelKey enum value or a custom model path (e.g., Replicate destination or training model ID).',
  })
  readonly model?: string;

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
  @MaxLength(400)
  @ApiProperty({
    description: 'Who or what the image is about',
    required: false,
  })
  readonly subject?: string;

  @IsString()
  @IsOptional()
  @MaxLength(400)
  @ApiProperty({
    description: 'What the subject does',
    required: false,
  })
  readonly action?: string;

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
  @Transform(toCommaSeparatedStrings)
  @ApiProperty({
    description: 'Array of blacklist element keys to exclude from generation',
    required: false,
    type: [String],
  })
  readonly blacklist?: string[];

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
}
