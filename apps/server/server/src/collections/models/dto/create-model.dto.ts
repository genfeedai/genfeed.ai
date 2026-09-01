import { ModelCategory, ModelLifecycle, ModelProvider } from '@genfeedai/enums';
import { ApiProperty } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  ValidateIf,
} from 'class-validator';

export class CreateModelDto {
  @IsString()
  @ApiProperty({ description: 'The display name of the model', required: true })
  readonly label!: string;

  @IsOptional()
  @IsString()
  @ApiProperty({
    description: 'Description of when and where to use this model',
    required: false,
  })
  readonly description?: string;

  @IsString()
  @ApiProperty({
    description: 'The type/category of the model',
    enum: ModelCategory,
    enumName: 'ModelCategory',
    required: true,
  })
  readonly category!: ModelCategory;

  @IsString()
  @ApiProperty({
    description: 'The unique identifier key for the model',
    type: String,
    required: true,
  })
  readonly key!: string;

  @IsOptional()
  @IsString()
  @ApiProperty({
    description:
      'Provider-side endpoint. Defaults to key for backward compatibility.',
    required: false,
  })
  readonly endpoint?: string;

  @IsString()
  @ApiProperty({
    description: 'The provider/service that hosts this model',
    enum: ModelProvider,
    enumName: 'ModelProvider',
    required: true,
  })
  readonly provider!: ModelProvider;

  @IsNumber()
  @ApiProperty({
    default: 0,
    description: 'The cost per usage of this model',
    required: true,
  })
  readonly cost!: number;

  @IsOptional()
  @IsEnum(ModelLifecycle)
  @ApiProperty({
    default: ModelLifecycle.AVAILABLE,
    description: 'Operator-controlled model lifecycle',
    enum: ModelLifecycle,
    enumName: 'ModelLifecycle',
    required: false,
  })
  readonly lifecycle?: ModelLifecycle;

  @IsString()
  @ValidateIf(
    (dto: CreateModelDto) =>
      dto.lifecycle === ModelLifecycle.LEGACY ||
      dto.lifecycle === ModelLifecycle.RETIRED,
  )
  @IsNotEmpty()
  @ApiProperty({
    description: 'Replacement model key required for Legacy and Retired',
    required: false,
  })
  readonly succeededBy?: string;

  @IsOptional()
  @IsBoolean()
  @ApiProperty({
    default: false,
    description: 'Whether the provider guarantees this route costs zero',
    required: false,
  })
  readonly isFree?: boolean;

  @IsOptional()
  @IsBoolean()
  @ApiProperty({
    default: true,
    description: 'Whether this model is active/visible in dropdowns',
    required: false,
  })
  readonly isActive?: boolean;

  @IsOptional()
  @IsBoolean()
  @ApiProperty({
    default: false,
    description: 'Whether this model is highlighted/featured',
    required: false,
  })
  readonly isHighlighted?: boolean;

  @IsOptional()
  @IsBoolean()
  @ApiProperty({
    default: false,
    description:
      'Whether this is the default model for its category (used by auto-router)',
    required: false,
  })
  readonly isDefault?: boolean;

  @IsOptional()
  @IsString()
  @ApiProperty({
    description: 'Owning organization for private/custom models',
    required: false,
  })
  readonly organizationId?: string;

  @IsOptional()
  @IsString()
  @ApiProperty({
    description: 'Parent/base model id for trained or derivative models',
    required: false,
  })
  readonly parentModelId?: string;

  @IsOptional()
  @IsString()
  @ApiProperty({
    description: 'Training id that produced this model',
    required: false,
  })
  readonly trainingId?: string;

  @IsOptional()
  @IsBoolean()
  @ApiProperty({
    default: true,
    description: 'Whether the model is globally available',
    required: false,
  })
  readonly isPublic?: boolean;

  @IsOptional()
  @IsBoolean()
  @ApiProperty({
    default: false,
    description: 'Whether this record represents a legacy seeded model',
    required: false,
  })
  readonly isLegacy?: boolean;

  @IsOptional()
  @IsBoolean()
  @ApiProperty({
    default: false,
    description: 'Whether this record was discovered from a provider API',
    required: false,
  })
  readonly isDiscovered?: boolean;

  @IsOptional()
  @IsObject()
  @ApiProperty({
    description: 'Provider-specific metadata used by sync/discovery jobs',
    required: false,
    type: Object,
  })
  readonly providerConfig?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  @ApiProperty({
    description: 'Provider-side model or version identifier',
    required: false,
  })
  readonly externalId?: string;

  @IsArray()
  @IsOptional()
  @IsString({ each: true })
  @ApiProperty({
    description: 'Features supported by the model',
    isArray: true,
    required: false,
    type: String,
  })
  readonly supportsFeatures?: string[];

  @IsOptional()
  @IsString()
  @ApiProperty({
    description: 'Provider trigger used by trained models',
    required: false,
  })
  readonly trigger?: string;

  @IsOptional()
  @IsString()
  @ApiProperty({
    description: 'Prompt trigger word used by trained models',
    required: false,
  })
  readonly triggerWord?: string;

  @IsOptional()
  @IsNumber()
  @ApiProperty({
    description: 'Commercial margin applied above provider cost',
    required: false,
  })
  readonly margin?: number;
}
