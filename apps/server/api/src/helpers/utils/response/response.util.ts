import type {
  IJsonApiSerializer,
  JsonApiCollectionResponse,
  JsonApiSingleResponse,
} from '@genfeedai/interfaces';
import { HttpException, HttpStatus } from '@nestjs/common';
import type { Request } from 'express';

export const returnNotFound = (type: string, id: string): never => {
  throw new HttpException(
    {
      detail: `${type} ${id} doesn't exist`,
      title: `${type} not found`,
    },
    HttpStatus.NOT_FOUND,
  );
};

export const returnBadRequest = (
  response: string | Record<string, unknown>,
): never => {
  throw new HttpException(response, HttpStatus.BAD_REQUEST);
};

export const returnUnauthorized = (message: string = 'Unauthorized'): never => {
  throw new HttpException(
    {
      detail: message,
      title: 'Unauthorized',
    },
    HttpStatus.UNAUTHORIZED,
  );
};

export const returnForbidden = (
  resource: string,
  action: string = 'access',
): never => {
  throw new HttpException(
    {
      detail: `You don't have permission to ${action} ${resource}`,
      title: 'Forbidden',
    },
    HttpStatus.FORBIDDEN,
  );
};

export const returnConflict = (resource: string, identifier: string): never => {
  throw new HttpException(
    {
      detail: `${resource} with identifier ${identifier} already exists`,
      title: 'Conflict',
    },
    HttpStatus.CONFLICT,
  );
};

export const returnInternalServerError = (
  message: string = 'An internal server error occurred',
): never => {
  throw new HttpException(
    {
      detail: message,
      title: 'Internal Server Error',
    },
    HttpStatus.INTERNAL_SERVER_ERROR,
  );
};

export const setTopLinks = (
  req: Request,
  serializerOptions: Record<string, unknown>,
  data: Record<string, unknown>,
) => {
  // Check if this is a paginated response (findAll) or single resource (findOne)
  // Paginated results have 'total' (from customLabels mapping totalDocs) and 'page'
  // Also check for 'docs' array to distinguish from single resource
  const isPaginated =
    data &&
    typeof data === 'object' &&
    'total' in data &&
    'page' in data &&
    Array.isArray(data.docs);

  const topLevelLinks = isPaginated
    ? {
        pagination: {
          limit: data.limit,
          page: data.page,
          pages: data.pages,
          total: data.total,
        },
        self: req.originalUrl,
      }
    : {
        self: req.originalUrl,
      };

  // IMPORTANT: Return a NEW object to avoid race conditions.
  // Serializers are singletons - mutating serializerOptions directly
  // causes data to leak between concurrent requests.
  return {
    ...serializerOptions,
    topLevelLinks,
  };
};

/**
 * Serialize a single entity response with proper links
 * Use this in standalone controllers that don't extend BaseCRUDController
 * @param request - Express request object
 * @param serializer - JSON:API serializer instance
 * @param data - Single entity data
 */
export const serializeSingle = (
  request: Request,
  serializer: IJsonApiSerializer | null,
  data: unknown,
): JsonApiSingleResponse => {
  if (!serializer) {
    return data as JsonApiSingleResponse;
  }
  serializer.opts = setTopLinks(
    request,
    { ...serializer.opts },
    data as Record<string, unknown>,
  );
  return serializer.serialize(data) as JsonApiSingleResponse;
};

/**
 * Serialize a collection response with pagination links
 * Use this in standalone controllers that don't extend BaseCRUDController
 * @param request - Express request object
 * @param serializer - JSON:API serializer instance
 * @param data - Paginated result with docs array and pagination info
 */
export const serializeCollection = (
  request: Request,
  serializer: IJsonApiSerializer | null,
  data: { docs: unknown[]; [key: string]: unknown },
): JsonApiCollectionResponse => {
  if (!serializer) {
    return data.docs as unknown as JsonApiCollectionResponse;
  }
  serializer.opts = setTopLinks(
    request,
    { ...serializer.opts },
    data as Record<string, unknown>,
  );
  return serializer.serialize(data.docs) as JsonApiCollectionResponse;
};
