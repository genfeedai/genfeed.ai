import { BaseQueryDto } from '@server/helpers/dto/base-query.dto';

/**
 * Query DTO for filtering and paginating brands
 * Inherits page/limit, sorting, and common filters from BaseQueryDto
 */
export class BrandQueryDto extends BaseQueryDto {}
