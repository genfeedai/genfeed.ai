import { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import { IsEntityId } from '@api/helpers/validation/entity-id.validator';
import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';

/**
 * Route-style entity type values accepted on the collapsed list endpoint
 * (`GET /evaluations?entityType=...&entityId=...`). These mirror the four
 * legacy dedicated routes (`/evaluations/posts/:id`, `/evaluations/articles/:id`,
 * `/evaluations/images/:id`, `/evaluations/videos/:id`) and are mapped to the
 * internal `contentType` storage values by the controller.
 */
export const EVALUATION_ENTITY_TYPES = [
  'posts',
  'articles',
  'images',
  'videos',
] as const;

export type EvaluationEntityType = (typeof EVALUATION_ENTITY_TYPES)[number];

export class EvaluationsQueryDto extends BaseQueryDto {
  @ApiProperty({
    description: 'Filter by target entity type',
    enum: EVALUATION_ENTITY_TYPES,
    required: false,
  })
  @IsOptional()
  @IsEnum(EVALUATION_ENTITY_TYPES)
  entityType?: EvaluationEntityType;

  @ApiProperty({
    description: 'Filter by target entity ID (requires entityType)',
    required: false,
  })
  @IsOptional()
  @IsEntityId()
  entityId?: string;
}
