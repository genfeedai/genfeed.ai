import {
  ContentRating,
  DarkroomAssetLabel as FleetAssetLabel,
  DarkroomReviewStatus as FleetReviewStatus,
} from '@genfeedai/enums';
import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNumber, IsOptional, IsString } from 'class-validator';

export class QueryAssetsDto {
  @IsString()
  @IsOptional()
  @ApiProperty({ description: 'Filter by persona slug', required: false })
  readonly personaSlug?: string;

  @IsEnum(FleetReviewStatus)
  @IsOptional()
  @ApiProperty({
    description: 'Filter by review status',
    enum: FleetReviewStatus,
    enumName: 'FleetReviewStatus',
    required: false,
  })
  readonly reviewStatus?: FleetReviewStatus;

  @IsEnum(FleetAssetLabel)
  @IsOptional()
  @ApiProperty({
    description: 'Filter by asset label',
    enum: FleetAssetLabel,
    enumName: 'FleetAssetLabel',
    required: false,
  })
  readonly assetLabel?: FleetAssetLabel;

  @IsEnum(ContentRating)
  @IsOptional()
  @ApiProperty({
    description: 'Filter by content rating',
    enum: ContentRating,
    enumName: 'ContentRating',
    required: false,
  })
  readonly contentRating?: ContentRating;

  @IsString()
  @IsOptional()
  @ApiProperty({ description: 'Filter by campaign', required: false })
  readonly campaign?: string;

  @IsNumber()
  @IsOptional()
  @ApiProperty({ description: 'Page number', required: false })
  readonly page?: number;

  @IsNumber()
  @IsOptional()
  @ApiProperty({ description: 'Items per page', required: false })
  readonly limit?: number;
}
