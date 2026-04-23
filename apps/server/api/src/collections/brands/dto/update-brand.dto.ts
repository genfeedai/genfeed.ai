import { CreateBrandDto } from '@api/collections/brands/dto/create-brand.dto';
import type {
  BrandAgentConfig,
  BrandReferenceImage,
} from '@api/collections/brands/schemas/brand.schema';
import { ApiProperty, PartialType } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsMongoId, IsOptional } from 'class-validator';

export class UpdateBrandDto extends PartialType(CreateBrandDto) {
  @IsBoolean()
  @IsOptional()
  @ApiProperty({
    description: 'Whether the brand is marked as deleted',
    required: false,
  })
  readonly isDeleted?: boolean;

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
  @IsMongoId()
  @ApiProperty({
    description: 'Owning user identifier',
    required: false,
  })
  readonly user?: string;
}
