import { ListingType } from '@genfeedai/enums';
import { ApiProperty } from '@nestjs/swagger';
import {
  IsArray,
  IsEnum,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateListingDto {
  @ApiProperty({
    description: 'Type of listing',
    enum: ListingType,
    enumName: 'ListingType',
  })
  @IsEnum(ListingType)
  type!: ListingType;

  @ApiProperty({
    description: 'Title of the listing',
    maxLength: 200,
  })
  @IsString()
  @MaxLength(200)
  title!: string;

  @ApiProperty({
    description: 'Short description for the listing card',
    maxLength: 300,
  })
  @IsString()
  @MaxLength(300)
  shortDescription!: string;

  @ApiProperty({
    description: 'Full description with markdown support',
    maxLength: 10000,
  })
  @IsString()
  @MaxLength(10000)
  description!: string;

  @ApiProperty({
    default: 0,
    description: 'Price in cents (0-50000)',
    maximum: 50000,
    minimum: 0,
    required: false,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(50000)
  price?: number;

  @ApiProperty({
    default: 'usd',
    description: 'Currency code for price (ISO 4217)',
    required: false,
  })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiProperty({
    description: 'Tags for discovery',
    required: false,
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @ApiProperty({
    description: 'URL for the thumbnail image',
    required: false,
  })
  @IsOptional()
  @IsUrl()
  thumbnail?: string;

  @ApiProperty({
    description: 'URLs for preview images',
    required: false,
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsUrl({}, { each: true })
  previewImages?: string[];

  @ApiProperty({
    description: 'URL for preview video',
    required: false,
  })
  @IsOptional()
  @IsUrl()
  previewVideo?: string;

  @ApiProperty({
    description: 'Preview data object visible to all users',
    required: false,
  })
  @IsOptional()
  @IsObject()
  previewData?: Record<string, unknown>;

  @ApiProperty({
    description: 'Download data object only accessible after purchase',
    required: false,
  })
  @IsOptional()
  @IsObject()
  downloadData?: Record<string, unknown>;

  @ApiProperty({
    description: 'Version string',
    required: false,
  })
  @IsOptional()
  @IsString()
  version?: string;

  @ApiProperty({
    description: 'Changelog for this version',
    required: false,
  })
  @IsOptional()
  @IsString()
  changelog?: string;
}
