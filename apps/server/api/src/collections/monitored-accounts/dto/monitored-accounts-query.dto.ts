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
  declare organizationId?: string;

  @ApiPropertyOptional({
    description: 'Filter by bot config ID',
    example: '507f1f77bcf86cd799439011',
  })
  @IsString()
  @IsOptional()
  botConfigId?: string;

  @ApiPropertyOptional({
    description: 'Filter by active status',
    example: true,
  })
  @IsBoolean()
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  isActive?: boolean;
}
