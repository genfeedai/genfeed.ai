import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';

export const BULK_UPDATE_ACTIVITIES_MAX_IDS = 100;

export class BulkUpdateActivitiesDto {
  @ApiProperty({
    description: `Array of activity IDs to update (max ${BULK_UPDATE_ACTIVITIES_MAX_IDS})`,
    example: ['507f1f77bcf86cd799439011', '507f1f77bcf86cd799439012'],
    maxItems: BULK_UPDATE_ACTIVITIES_MAX_IDS,
    type: [String],
  })
  @IsArray()
  @ArrayMaxSize(BULK_UPDATE_ACTIVITIES_MAX_IDS)
  @IsNotEmpty()
  @IsString({ each: true })
  ids!: string[];

  @ApiProperty({
    description: 'Mark activities as read',
    example: true,
    required: false,
  })
  @IsBoolean()
  @IsOptional()
  isRead?: boolean;

  @ApiProperty({
    description: 'Soft-delete activities',
    example: true,
    required: false,
  })
  @IsBoolean()
  @IsOptional()
  isDeleted?: boolean;
}
