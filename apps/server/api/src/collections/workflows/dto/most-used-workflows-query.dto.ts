import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export const MOST_USED_WORKFLOWS_DEFAULT_LIMIT = 5;
export const MOST_USED_WORKFLOWS_MAX_LIMIT = 12;

/** Query params for `GET /workflows/most-used` (#5510). */
export class MostUsedWorkflowsQueryDto {
  @ApiProperty({
    default: MOST_USED_WORKFLOWS_DEFAULT_LIMIT,
    description: 'Number of workflows to return',
    maximum: MOST_USED_WORKFLOWS_MAX_LIMIT,
    minimum: 1,
    required: false,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MOST_USED_WORKFLOWS_MAX_LIMIT)
  @Transform(({ value }) =>
    value !== undefined && value !== null
      ? Number(value)
      : MOST_USED_WORKFLOWS_DEFAULT_LIMIT,
  )
  readonly limit: number = MOST_USED_WORKFLOWS_DEFAULT_LIMIT;
}
