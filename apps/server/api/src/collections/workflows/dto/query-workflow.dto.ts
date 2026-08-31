import { ApiProperty } from '@nestjs/swagger';
import { BaseQueryDto } from '@server/helpers/dto/base-query.dto';
import { IsEntityId } from '@server/helpers/validation/entity-id.validator';
import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional } from 'class-validator';

/**
 * Query params for `GET /workflows`.
 *
 * `referencable=true` returns every workflow in the org (the list used to seed
 * workflow-reference pickers) instead of the default caller-scoped
 * user + system-visible set. Replaces the former `GET /workflows/referencable`
 * RPC route (#1354).
 *
 * `source=system-catalog` lists code-owned installable system templates for
 * the org (not persisted workflow rows). Install via
 * `POST /workflows { templateId, sourceType: "system-catalog" }` (#2176).
 */
export class WorkflowQueryDto extends BaseQueryDto {
  @IsEntityId()
  @IsOptional()
  @ApiProperty({
    description:
      'Restrict visible workflows to the active brand for an authorized picker.',
    required: false,
  })
  readonly brandId?: string;

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
      'Include persisted system-workflow clones. Customer Automation omits this; Admin → Automation → Workflows sets it.',
    required: false,
  })
  readonly includeSystem?: boolean;

  @IsOptional()
  @IsIn(['system-catalog'])
  @ApiProperty({
    description:
      'When `system-catalog`, return the code-owned system workflow catalog for this organization instead of persisted workflows.',
    enum: ['system-catalog'],
    required: false,
  })
  readonly source?: 'system-catalog';

  @IsOptional()
  @IsIn(['statistics'])
  @ApiProperty({
    description:
      'When `statistics`, return aggregated workflow stats for the org instead of the list.',
    enum: ['statistics'],
    required: false,
  })
  readonly view?: 'statistics';
}
