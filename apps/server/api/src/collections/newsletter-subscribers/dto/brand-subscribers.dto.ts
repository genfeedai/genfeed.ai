import {
  BRAND_SUBSCRIBER_ADD_MAX_EMAILS,
  BRAND_SUBSCRIBER_IMPORT_MAX_BYTES,
  BRAND_SUBSCRIBER_PUBLIC_SOURCES,
  BRAND_SUBSCRIBER_STATUSES,
  type BrandSubscriberPublicSource,
  type BrandSubscriberStatus,
} from '@genfeedai/contracts/constants';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  Equals,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

export class BrandSubscribersQueryDto {
  @IsOptional()
  @IsIn(BRAND_SUBSCRIBER_STATUSES)
  @ApiPropertyOptional({ enum: BRAND_SUBSCRIBER_STATUSES })
  readonly status?: BrandSubscriberStatus;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  @ApiPropertyOptional()
  readonly tag?: string;

  @IsOptional()
  @IsString()
  @MaxLength(254)
  @ApiPropertyOptional({ description: 'Matches email or name.' })
  readonly search?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @ApiPropertyOptional({ default: 1 })
  readonly page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  @ApiPropertyOptional({ default: 50 })
  readonly limit?: number;
}

export class AddBrandSubscribersDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(BRAND_SUBSCRIBER_ADD_MAX_EMAILS)
  @IsString({ each: true })
  @MaxLength(20_000, { each: true })
  @ApiProperty({
    description:
      'Addresses, one per entry; an entry may hold a pasted list separated by new lines, commas or spaces.',
    type: [String],
  })
  readonly emails!: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(50, { each: true })
  @ApiPropertyOptional({ type: [String] })
  readonly tags?: string[];

  @IsBoolean()
  @ApiProperty({
    description:
      'True when the owner confirms these people agreed to receive the newsletter; they become active. False sends each a confirmation email.',
  })
  readonly hasConsent!: boolean;
}

export class ImportBrandSubscribersDto {
  @IsString()
  @MaxLength(BRAND_SUBSCRIBER_IMPORT_MAX_BYTES)
  @ApiProperty({ description: 'The CSV file contents.' })
  readonly csv!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  @ApiPropertyOptional()
  readonly fileName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  @ApiPropertyOptional({ description: 'Header of the email column.' })
  readonly emailColumn?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  @ApiPropertyOptional({ description: 'Header of the name column.' })
  readonly nameColumn?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  @ApiPropertyOptional({ description: 'Header of the tags column.' })
  readonly tagsColumn?: string;

  @IsOptional()
  @IsBoolean()
  @ApiPropertyOptional({
    description: 'Report the counts without writing anything.',
  })
  readonly isPreview?: boolean;

  @ValidateIf((dto: ImportBrandSubscribersDto) => dto.isPreview !== true)
  @Equals(true, {
    message: 'Confirm you have consent from every address before importing.',
  })
  @ApiPropertyOptional({
    description:
      'Required for an import: the owner confirms every address in the file agreed to receive the newsletter.',
  })
  readonly hasConsent?: boolean;
}

export class PublicSubscribeDto {
  @IsString()
  @MaxLength(64)
  @ApiProperty()
  readonly brandId!: string;

  @IsEmail()
  @MaxLength(254)
  @ApiProperty()
  readonly email!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  @ApiPropertyOptional()
  readonly name?: string;

  @IsOptional()
  @IsIn(BRAND_SUBSCRIBER_PUBLIC_SOURCES)
  @ApiPropertyOptional({ enum: BRAND_SUBSCRIBER_PUBLIC_SOURCES })
  readonly source?: BrandSubscriberPublicSource;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  @ApiPropertyOptional({
    description: 'The article, post or issue the form sat on.',
  })
  readonly sourceRef?: string;
}
