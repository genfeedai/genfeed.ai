import { buildSearchWhere } from '@api/helpers/utils/search-where/search-where.util';
import type { Prisma } from '@genfeedai/prisma';

/** The Turbo list search: a case-insensitive match on the project name. */
export function turboProjectSearchWhere(
  search: string | undefined,
): Pick<Prisma.TurboProjectWhereInput, 'AND'> {
  return buildSearchWhere<Prisma.TurboProjectWhereInput>(search, {
    columns: ['name'],
  });
}
