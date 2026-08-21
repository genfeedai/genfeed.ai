import { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';

/**
 * Query DTO for filtering and paginating organizations
 * Inherits pagination, sorting, and common filters from BaseQueryDto
 */
export class OrganizationQueryDto extends BaseQueryDto {
  @IsBoolean()
  @IsOptional()
  @Transform(({ value }) =>
    value === 'true' || value === true
      ? true
      : value === 'false' || value === false
        ? false
        : value,
  )
  @ApiPropertyOptional({
    description:
      'When true, return membership summaries for the current user (cross-org). This is the default for non-superadmins.',
  })
  readonly mine?: boolean;
}
