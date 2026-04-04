import { ApiProperty } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';

export class BulkUpdateActivitiesDto {
  @ApiProperty({
    description: 'Array of activity IDs to update',
    example: ['507f1f77bcf86cd799439011', '507f1f77bcf86cd799439012'],
    type: [String],
  })
  @IsArray()
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
