import { BaseQueryDto } from '@server/helpers/dto/base-query.dto';

/**
 * Query DTO for filtering and paginating activities
 * Inherits page/limit, sorting, and common filters from BaseQueryDto
 */
export class ActivitiesQueryDto extends BaseQueryDto {
  // Add activity-specific query parameters here if needed
}
