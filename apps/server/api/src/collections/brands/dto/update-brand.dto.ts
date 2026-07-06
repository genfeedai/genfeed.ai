import { CreateBrandDto } from '@api/collections/brands/dto/create-brand.dto';
import type {
  BrandAgentConfig,
  BrandReferenceImage,
} from '@api/collections/brands/schemas/brand.schema';
import { IsEntityId } from '@api/helpers/validation/entity-id.validator';
import { ApiProperty, PartialType } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class UpdateBrandDto extends PartialType(CreateBrandDto) {
  @IsBoolean()
  @IsOptional()
  @ApiProperty({
    description: 'Whether the brand is marked as deleted',
    required: false,
  })
  readonly isDeleted?: boolean;

  @IsObject()
  @IsOptional()
  @ApiProperty({
    description: 'Agent configuration overrides for the brand',
    required: false,
    type: Object,
  })
  readonly agentConfig?: Partial<BrandAgentConfig>;

  @IsOptional()
  @IsArray()
  @ApiProperty({
    description: 'Reference images used for generation consistency',
    required: false,
    type: [Object],
  })
  readonly referenceImages?: BrandReferenceImage[];

  @IsOptional()
  @IsEntityId()
  @ApiProperty({
    description: 'Owning user identifier',
    required: false,
  })
  readonly user?: string;

  @IsOptional()
  @IsEntityId()
  @ApiProperty({
    description:
      'Destination organization identifier. Providing a different value than the ' +
      "brand's current organization relocates the brand — cascading organizationId " +
      'across all brand-owned records in one transaction. Superadmin, or an owner/' +
      'admin of both the source and destination organizations, only.',
    required: false,
  })
  readonly organizationId?: string;

  @IsOptional()
  @IsBoolean()
  @ApiProperty({
    description:
      'Onboarding-only control flag. When true and `label` is present, the brand ' +
      "rename cascades to the owning organization's label + slug (and the brand's " +
      'own slug), matching the single-brand onboarding workspace. Never persisted ' +
      'on the brand record.',
    required: false,
  })
  readonly syncOrganizationName?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  @ApiProperty({
    description:
      'Onboarding-only organization label override used with syncOrganizationName. ' +
      'The server regenerates the unique organization slug and never persists this ' +
      'control field on the brand record.',
    required: false,
  })
  readonly organizationLabel?: string;

  @IsOptional()
  @IsString()
  @ApiProperty({
    description:
      'Server-verified confirmation token from GET /brands/:id/relocation-preview, ' +
      'required whenever the relocation would clone shared workflows into the ' +
      'destination organization. A stale or missing token is rejected with 409 so a ' +
      'client cannot bypass the consent modal or move against an outdated preview.',
    required: false,
  })
  readonly relocationAck?: string;
}
