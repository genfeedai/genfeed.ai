import { ValidationException } from '@api/helpers/exceptions/http/validation.exception';
import type { BasePaginationQuery } from '@api/helpers/types/common/common.types';
import { handleQuerySort } from '@api/helpers/utils/sort/sort.util';

export interface ProcessedPaginationQuery {
  page: number;
  limit: number;
  pagination: boolean;
  sort: Record<string, number>;
  skip: number;
}

export interface QueryProcessorOptions {
  defaultLimit: number;
  maxLimit: number;
  defaultSort: Record<string, number>;
}

export class QueryProcessor {
  private static readonly DEFAULT_OPTIONS: QueryProcessorOptions = {
    defaultLimit: 10,
    defaultSort: { createdAt: -1 },
    maxLimit: 100,
  };

  /**
   * Process pagination query parameters with validation
   */
  static processPaginationQuery(
    query: BasePaginationQuery,
    options: Partial<QueryProcessorOptions> = {},
  ): ProcessedPaginationQuery {
    const opts = { ...QueryProcessor.DEFAULT_OPTIONS, ...options };

    // Validate and process page
    const page = QueryProcessor.validatePage(query.page);

    // Validate and process limit
    const limit = QueryProcessor.validateLimit(
      query.limit,
      opts.maxLimit,
      opts.defaultLimit,
    );

    // Process pagination flag
    const pagination = query.pagination !== false;

    // Process sort
    const sort = query.sort ? handleQuerySort(query.sort) : opts.defaultSort;

    // Calculate skip for MongoDB
    const skip = (page - 1) * limit;

    return {
      limit,
      page,
      pagination,
      skip,
      sort,
    };
  }

  static createPaginationQuery(
    processedQuery: ProcessedPaginationQuery,
  ): Array<Record<string, unknown>> {
    const query: Array<Record<string, unknown>> = [];

    query.push({ orderBy: processedQuery.sort });

    if (processedQuery.pagination) {
      query.push({ skip: processedQuery.skip });
      query.push({ take: processedQuery.limit });
    }

    return query;
  }

  /**
   * Process search query with text search capabilities
   */
  static processSearchQuery(
    searchTerm?: string,
    searchFields: string[] = ['name', 'description', 'title'],
  ): Record<string, unknown> | null {
    if (
      !searchTerm ||
      typeof searchTerm !== 'string' ||
      searchTerm.trim().length === 0
    ) {
      return null;
    }

    const trimmedSearch = searchTerm.trim();

    // Use MongoDB text search if available
    if (searchFields.includes('$text')) {
      return {
        $text: {
          $caseSensitive: false,
          $search: trimmedSearch,
        },
      };
    }

    // Otherwise use regex search across specified fields
    const searchRegex = new RegExp(trimmedSearch, 'i');

    if (searchFields.length === 1) {
      return { [searchFields[0]]: searchRegex };
    }

    return {
      OR: searchFields.map((field) => ({ [field]: searchRegex })),
    };
  }

  /**
   * Process date range filters
   */
  static processDateRangeQuery(
    startDate?: string | Date,
    endDate?: string | Date,
    field: string = 'createdAt',
  ): Record<string, unknown> | null {
    const dateQuery: Record<string, unknown> = {};
    let hasDateFilter = false;

    if (startDate) {
      const start = new Date(startDate);
      if (Number.isNaN(start.getTime())) {
        throw new ValidationException(
          `Invalid start date format: ${String(startDate)}`,
        );
      }
      dateQuery.gte = start;
      hasDateFilter = true;
    }

    if (endDate) {
      const end = new Date(endDate);
      if (Number.isNaN(end.getTime())) {
        throw new ValidationException(
          `Invalid end date format: ${String(endDate)}`,
        );
      }
      dateQuery.lte = end;
      hasDateFilter = true;
    }

    return hasDateFilter ? { [field]: dateQuery } : null;
  }

  /**
   * Combine multiple query filters
   */
  static combineFilters(
    ...filters: Array<Record<string, unknown> | null>
  ): Record<string, unknown> {
    const validFilters = filters.filter(
      (filter) => filter !== null && Object.keys(filter).length > 0,
    );

    if (validFilters.length === 0) {
      return {};
    }

    if (validFilters.length === 1) {
      return validFilters[0] as Record<string, unknown>;
    }

    return { AND: validFilters };
  }

  /**
   * Create aggregation options for aggregate pagination helpers.
   */
  static createAggregationOptions(
    processedQuery: ProcessedPaginationQuery,
    customLabels?: Record<string, string>,
  ): Record<string, unknown> {
    const options: Record<string, unknown> = {
      limit: processedQuery.limit,
      page: processedQuery.page,
      pagination: processedQuery.pagination,
      sort: processedQuery.sort,
    };

    if (customLabels) {
      options.customLabels = {
        docs: 'data',
        hasNextPage: 'hasNextPage',
        hasPrevPage: 'hasPrevPage',
        limit: 'limit',
        nextPage: 'nextPage',
        page: 'page',
        pagingCounter: 'pagingCounter',
        prevPage: 'prevPage',
        totalDocs: 'total',
        totalPages: 'totalPages',
        ...customLabels,
      };
    }

    return options;
  }

  private static validatePage(page?: number): number {
    if (page === undefined || page === null) {
      return 1;
    }

    const pageNumber = Number(page);

    if (Number.isNaN(pageNumber) || pageNumber < 1) {
      throw new ValidationException('Page must be a positive integer');
    }

    if (pageNumber > 10000) {
      throw new ValidationException(
        'Page number is too large. Maximum allowed is 10000',
      );
    }

    return Math.floor(pageNumber);
  }

  private static validateLimit(
    limit?: number,
    maxLimit: number = 100,
    defaultLimit: number = 10,
  ): number {
    if (limit === undefined || limit === null) {
      return defaultLimit;
    }

    const limitNumber = Number(limit);

    if (Number.isNaN(limitNumber) || limitNumber < 1) {
      throw new ValidationException('Limit must be a positive integer');
    }

    if (limitNumber > maxLimit) {
      throw new ValidationException(`Limit cannot exceed ${maxLimit}`);
    }

    return Math.floor(limitNumber);
  }
}
