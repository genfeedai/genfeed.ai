import { BaseQueryDto } from '@server/helpers/dto/base-query.dto';

/**
 * Query DTO for filtering and paginating links
 * Inherits pagination, sorting, and common filters from BaseQueryDto
 */
export class LinksQueryDto extends BaseQueryDto {}
