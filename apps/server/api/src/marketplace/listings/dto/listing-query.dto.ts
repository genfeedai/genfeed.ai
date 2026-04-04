import { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import { ListingStatus, ListingType, PricingTier } from '@genfeedai/enums';
import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class ListingQueryDto extends BaseQueryDto {
  @ApiProperty({
    description: 'Filter listings by type',
    enum: ListingType,
    enumName: 'ListingType',
    required: false,
  })
  @IsOptional()
  @IsEnum(ListingType)
  type?: ListingType;

  @ApiProperty({
    description: 'Filter listings by status',
    enum: ListingStatus,
    enumName: 'ListingStatus',
    required: false,
  })
  @IsOptional()
  @IsEnum(ListingStatus)
  status?: ListingStatus;

  @ApiProperty({
    description: 'Filter listings by tags',
    required: false,
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Transform(({ value }) => {
    if (!value) {
      return undefined;
    }

    if (Array.isArray(value)) {
      return value;
    }

    return [value];
  })
  tags?: string[];

  @ApiProperty({
    description: 'Minimum price in cents',
    minimum: 0,
    required: false,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Transform(({ value }) => (value ? Number(value) : undefined))
  minPrice?: number;

  @ApiProperty({
    description: 'Maximum price in cents',
    maximum: 50000,
    required: false,
  })
  @IsOptional()
  @IsNumber()
  @Max(50000)
  @Transform(({ value }) => (value ? Number(value) : undefined))
  maxPrice?: number;

  @ApiProperty({
    description: 'Search listings by title or description',
    required: false,
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiProperty({
    description: 'Filter by seller slug',
    required: false,
  })
  @IsOptional()
  @IsString()
  sellerSlug?: string;

  @ApiProperty({
    description: 'Filter by pricing tier',
    enum: PricingTier,
    enumName: 'PricingTier',
    required: false,
  })
  @IsOptional()
  @IsEnum(PricingTier)
  pricingTier?: PricingTier;

  @ApiProperty({
    description: 'Filter by official listings only',
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  isOfficial?: boolean;
}
