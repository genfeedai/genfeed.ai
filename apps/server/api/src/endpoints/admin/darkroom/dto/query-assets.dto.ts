import {
  ContentRating,
  DarkroomAssetLabel,
  DarkroomReviewStatus,
} from '@genfeedai/enums';
import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNumber, IsOptional, IsString } from 'class-validator';

export class QueryAssetsDto {
  @IsString()
  @IsOptional()
  @ApiProperty({ description: 'Filter by persona slug', required: false })
  readonly personaSlug?: string;

  @IsEnum(DarkroomReviewStatus)
  @IsOptional()
  @ApiProperty({
    description: 'Filter by review status',
    enum: DarkroomReviewStatus,
    enumName: 'DarkroomReviewStatus',
    required: false,
  })
  readonly reviewStatus?: DarkroomReviewStatus;

  @IsEnum(DarkroomAssetLabel)
  @IsOptional()
  @ApiProperty({
    description: 'Filter by asset label',
    enum: DarkroomAssetLabel,
    enumName: 'DarkroomAssetLabel',
    required: false,
  })
  readonly assetLabel?: DarkroomAssetLabel;

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
