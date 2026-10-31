import type { IPaginationParams } from '@genfeedai/contracts/interfaces';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

/**
 * `page` / `limit` query for endpoints that page straight from the database
 * (Prisma skip/take + count). Defaults are applied by the service via
 * {@link resolvePageWindow} so a missing query still yields a bounded read.
 */
export class PaginationQueryDto {
  @ApiProperty({
    default: 1,
    description: 'Page number for pagination',
    minimum: 1,
    required: false,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiProperty({
    default: DEFAULT_PAGE_SIZE,
    description: 'Number of items per page',
    maximum: MAX_PAGE_SIZE,
    minimum: 1,
    required: false,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  limit?: number;
}

export interface PageWindow {
  limit: number;
  page: number;
  skip: number;
}

/** Normalises an optional page/limit pair into a bounded skip/take window. */
export function resolvePageWindow(
  query: PaginationQueryDto | undefined,
  defaultLimit: number = DEFAULT_PAGE_SIZE,
): PageWindow {
  const page = Math.max(1, Math.floor(query?.page ?? 1));
  const limit = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, Math.floor(query?.limit ?? defaultLimit)),
  );
  return { limit, page, skip: (page - 1) * limit };
}

/**
 * Page descriptor for single-resource reports that embed a page of rows
 * (the JSON:API `pagination` link is only emitted for collections).
 */
export function toPaginationParams(
  total: number,
  page: number,
  limit: number,
): IPaginationParams {
  return { limit, page, pages: Math.ceil(total / limit), total };
}
