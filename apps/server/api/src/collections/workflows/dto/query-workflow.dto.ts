import { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';

/**
 * Query params for `GET /workflows`.
 *
 * `referencable=true` returns every workflow in the org (the list used to seed
 * workflow-reference pickers) instead of the default caller-scoped
 * user + system-visible set. Replaces the former `GET /workflows/referencable`
 * RPC route (#1354).
 */
export class WorkflowQueryDto extends BaseQueryDto {
  @IsBoolean()
  @IsOptional()
  @Transform(({ value }) =>
    value === 'true' || value === true
      ? true
      : value === 'false' || value === false
        ? false
        : value,
  )
  @ApiProperty({
    description:
      'Return every workflow in the organization (for reference pickers) instead of the caller-scoped set',
    required: false,
  })
  readonly referencable?: boolean;
}
