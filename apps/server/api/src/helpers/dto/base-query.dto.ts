import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateIf,
} from 'class-validator';
import { Types } from 'mongoose';

export class BaseQueryDto {
  @ApiProperty({
    default: 1,
    description: 'Page number for pagination',
    minimum: 1,
    required: false,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Transform(({ value }) =>
    value !== undefined && value !== null ? Number(value) : 1,
  )
  page: number = 1;

  @ApiProperty({
    default: 10,
    description: 'Number of items per page',
    maximum: 100,
    minimum: 1,
    required: false,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Transform(({ value }) =>
    value !== undefined && value !== null ? Number(value) : 10,
  )
  limit: number = 10;

  @ApiProperty({
    default: true,
    description: 'Enable or disable pagination',
    required: false,
  })
  @IsOptional()
  @ValidateIf((o) => o.pagination !== undefined)
  @Transform(({ value }) => {
    if (value === undefined || value === null) {
      return true;
    }
    if (value === 'false' || value === false) {
      return false;
    }
    if (value === 'true' || value === true) {
      return true;
    }
    if (value === '0' || value === 0) {
      return false;
    }
    if (value === '') {
      return false;
    }

    return Boolean(value);
  })
  @IsBoolean()
  pagination: boolean = true;

  @ApiProperty({
    default: false,
    description: 'Filter by deleted status',
    required: false,
  })
  @IsOptional()
  @ValidateIf((o) => o.isDeleted !== undefined)
  @Transform(({ value }) => {
    if (value === undefined || value === null) {
      return false;
    }
    if (value === 'true' || value === true) {
      return true;
    }
    if (value === 'false' || value === false) {
      return false;
    }
    if (value === '0' || value === 0) {
      return false;
    }
    if (value === '') {
      return false;
    }
    return Boolean(value);
  })
  @IsBoolean()
  isDeleted: boolean = false;

  @ApiProperty({
    default: 'createdAt: -1',
    description:
      'Sort field(s) and order (e.g., "createdAt: -1" or "category: 1, createdAt: -1")',
    required: false,
  })
  @IsOptional()
  @IsString()
  @Transform(({ value }) =>
    value !== undefined && value !== null ? value : 'createdAt: -1',
  )
  sort: string = 'createdAt: -1';

  @ApiProperty({
    description: 'Filter by organization ID (superadmin only)',
    required: false,
  })
  @IsOptional()
  @IsMongoId()
  organization?: string | Types.ObjectId;

  @ApiProperty({
    description: 'Filter by brand ID (superadmin only)',
    required: false,
  })
  @IsOptional()
  @IsMongoId()
  brand?: string | Types.ObjectId;

  @ApiProperty({
    description: 'Filter by favorite status',
    required: false,
  })
  @IsOptional()
  @ValidateIf((o) => o.isFavorite !== undefined)
  @Transform(({ value }) => {
    if (value === undefined || value === null) {
      return undefined;
    }
    if (value === 'true' || value === true) {
      return true;
    }
    if (value === 'false' || value === false) {
      return false;
    }
    if (value === '0' || value === 0) {
      return false;
    }
    if (value === '') {
      return undefined;
    }
    return value ? true : undefined;
  })
  @IsBoolean()
  isFavorite?: boolean;
}
