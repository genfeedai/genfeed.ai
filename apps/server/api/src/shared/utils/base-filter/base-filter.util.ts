import { isEntityId } from '@api/helpers/validation/entity-id.validator';

type QueryFragment = Record<string, unknown>;

export class BaseFilterUtil {
  static buildArrayInFilter(
    field: string,
    values?: string | string[],
  ): QueryFragment {
    if (!values) return {};

    const arrayValues = Array.isArray(values) ? values : [values];
    return arrayValues.length > 0 ? { [field]: { in: arrayValues } } : {};
  }

  static parseBooleanFilter(value?: string | boolean): boolean | undefined {
    if (value === undefined) return undefined;
    if (typeof value === 'string') {
      return value !== 'false' && value !== '0' && value !== '';
    }
    return Boolean(value);
  }

  static buildSearchFilter(
    search?: string,
    fields: string[] = ['label', 'description'],
  ): QueryFragment {
    if (!search?.trim()) return {};

    const searchFilter = { contains: search.trim(), mode: 'insensitive' };
    return { OR: fields.map((field) => ({ [field]: searchFilter })) };
  }

  static buildObjectIdFilter(field: string, id?: string): QueryFragment {
    return id && isEntityId(id) ? { [field]: id } : {};
  }

  static buildSortStage(
    sortBy: string = 'createdAt',
    sortDirection: 'asc' | 'desc' = 'desc',
  ): QueryFragment {
    return { orderBy: { [sortBy]: sortDirection === 'asc' ? 1 : -1 } };
  }

  static buildSingleLookup(_from: string, _localField: string): QueryFragment {
    return {};
  }

  static buildConditionalLookup(): QueryFragment {
    return {};
  }

  static buildScopeOrConditions(publicMetadata: {
    organization?: string;
    user?: string;
  }): QueryFragment[] {
    const orConditions: QueryFragment[] = [{ organization: null, user: null }];

    if (publicMetadata.organization) {
      orConditions.push({ organization: publicMetadata.organization });
    }

    if (publicMetadata.user) {
      orConditions.push({ user: publicMetadata.user });
    }

    return orConditions;
  }

  static normalizeToArray<T>(value?: T | T[]): T[] {
    if (!value) return [];
    return Array.isArray(value) ? value : [value];
  }
}
