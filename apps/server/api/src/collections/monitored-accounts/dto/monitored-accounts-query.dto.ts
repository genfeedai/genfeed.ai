import { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class MonitoredAccountsQueryDto extends BaseQueryDto {
  @ApiPropertyOptional({
    description: 'Filter by organization ID',
    example: '507f1f77bcf86cd799439011',
  })
  @IsString()
  @IsOptional()
  organization?: string;

  @ApiPropertyOptional({
    description: 'Filter by bot config ID',
    example: '507f1f77bcf86cd799439011',
  })
  @IsString()
  @IsOptional()
  botConfig?: string;

  @ApiPropertyOptional({
    description: 'Filter by brand ID',
    example: '507f1f77bcf86cd799439011',
  })
  @IsString()
  @IsOptional()
  brand?: string;

  @ApiPropertyOptional({
    description: 'Filter by active status',
    example: true,
  })
  @IsBoolean()
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  isActive?: boolean;

  @ApiPropertyOptional({
    description: 'Include deleted items',
    example: false,
  })
  @IsBoolean()
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  // @ts-expect-error TS2416
  isDeleted?: boolean;
}
