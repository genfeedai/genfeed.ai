import { ModelCategory, ModelProvider } from '@genfeedai/enums';
import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
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
  readonly organization?: string;

  @IsOptional()
  @IsString()
  @ApiProperty({
    description: 'Parent/base model id for trained or derivative models',
    required: false,
  })
  readonly parentModel?: string;

  @IsOptional()
  @IsString()
  @ApiProperty({
    description: 'Training id that produced this model',
    required: false,
  })
  readonly training?: string;

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
  @IsNumber()
  @ApiProperty({
    description: 'Commercial margin applied above provider cost',
    required: false,
  })
  readonly margin?: number;
}
