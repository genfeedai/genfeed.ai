import type { BaseService } from '@genfeedai/services/core/base.service';
import { logger } from '@genfeedai/services/core/logger.service';
import { NotificationsService } from '@genfeedai/services/core/notifications.service';
import {
  type UseResourceOptions,
  type UseResourceReturn,
  type UseResourceReturnNullable,
  useResource,
} from '@hooks/data/resource/use-resource/use-resource';
import { withSilentOperation } from '@hooks/utils/service-operation/service-operation.util';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

/**
 * Simple CRUD hooks that wrap useResource for common operations
 * These hooks eliminate boilerplate for standard CRUD operations
 */

interface MutationOptions<TSuccess> {
  onSuccess?: (data: TSuccess) => void;
  onError?: (error: Error) => void;
}

interface UseMutationReturn<T> {
  runMutation: <R>(
    url: string,
    operation: (service: BaseService<T>) => Promise<R>,
    onSuccess?: (result: R) => void,
    onError?: (error: Error) => void,
    errorMessage?: string,
  ) => Promise<R | null>;
  isLoading: boolean;
  error: Error | null;
}

/**
 * Internal hook that provides shared mutation logic for useCreate, useUpdate, useDelete
 */
function useMutation<T>(
  getService: () => Promise<BaseService<T>>,
): UseMutationReturn<T> {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const isMountedRef = useRef(true);

  const runMutation = useCallback(
    async <R>(
      url: string,
      operation: (service: BaseService<T>) => Promise<R>,
      onSuccess?: (result: R) => void,
      onError?: (error: Error) => void,
      errorMessage = 'Operation failed',
    ): Promise<R | null> => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      const controller = new AbortController();
      abortControllerRef.current = controller;

      setIsLoading(true);
      setError(null);

      try {
        const service = await getService();
        const result = await withSilentOperation<R>({
          errorMessage,
          onSuccess,
          operation: () => operation(service),
          rethrow: true,
          url,
        });

        if (controller.signal.aborted || !isMountedRef.current) {
          return null;
        }

        return result ?? null;
      } catch (err) {
        const caughtError = err as Error;
        if (!controller.signal.aborted && isMountedRef.current) {
          setError(caughtError);
        }
        logger.error(`${url} failed`, caughtError);
        NotificationsService.getInstance().error(
          caughtError.message || errorMessage,
        );
        onError?.(caughtError);
        return null;
      } finally {
        if (!controller.signal.aborted && isMountedRef.current) {
          setIsLoading(false);
        }
      }
    },
    [getService],
  );

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  return { error, isLoading, runMutation };
}

/**
 * Fetch all resources (list)
 *
 * @example
 * ```typescript
 * const { data = [], isLoading, error, refresh } = useFindAll(
 *   getArticlesService,
 *   { brand: brandId },
 *   { dependencies: [brandId] }
 * );
 * ```
 */
export function useFindAll<T>(
  getService: () => Promise<BaseService<T>>,
  query?: Record<string, unknown>,
  options?: UseResourceOptions<T[]>,
): UseResourceReturn<T[]> {
  const queryString = query ? JSON.stringify(query) : null;
  const queryDependency = useMemo(() => queryString, [queryString]);
  const serviceTypeRef = useRef<string | null>(null);
  const [autoCacheKey, setAutoCacheKey] = useState<string | undefined>(
    undefined,
  );

  const resolvedCacheKey = options?.cacheKey ?? autoCacheKey;

  return useResource<T[]>(
    async () => {
      const service = await getService();
      if (!serviceTypeRef.current && service._serializer?.type) {
        serviceTypeRef.current = service._serializer.type;
        const key = `findAll:${service._serializer.type}:${queryString ?? ''}`;
        setAutoCacheKey(key);
      }
      return service.findAll(query ?? {});
    },
    {
      ...options,
      cacheKey: resolvedCacheKey,
      cacheTimeMs: options?.cacheTimeMs ?? 30_000,
      defaultValue: options?.defaultValue ?? ([] as T[]),
      dependencies: [...(options?.dependencies ?? []), queryDependency],
    },
  ) as UseResourceReturn<T[]>;
}

/**
 * Fetch a single resource by ID
 *
 * @example
 * ```typescript
 * const { data, isLoading, error, refresh } = useFindOne(
 *   getArticleService,
 *   articleId,
 *   undefined,
 *   { dependencies: [articleId], enabled: !!articleId }
 * );
 * ```
 */
export function useFindOne<T>(
  getService: () => Promise<BaseService<T>>,
  id: string | null | undefined,
  query?: Record<string, unknown>,
  options?: UseResourceOptions<T>,
): UseResourceReturnNullable<T> {
  const queryString = query ? JSON.stringify(query) : null;
  const queryDependency = useMemo(() => queryString, [queryString]);
  const serviceTypeRef = useRef<string | null>(null);
  const [autoCacheKey, setAutoCacheKey] = useState<string | undefined>(
    undefined,
  );

  const resolvedCacheKey = options?.cacheKey ?? autoCacheKey;

  return useResource<T>(
    async () => {
      if (!id) {
        throw new Error('ID is required for findOne');
      }
      const service = await getService();
      if (!serviceTypeRef.current && service._serializer?.type) {
        serviceTypeRef.current = service._serializer.type;
        const key = `findOne:${service._serializer.type}:${id}:${queryString ?? ''}`;
        setAutoCacheKey(key);
      }
      return service.findOne(id, query ?? {});
    },
    {
      ...options,
      cacheKey: resolvedCacheKey,
      cacheTimeMs: options?.cacheTimeMs ?? 30_000,
      dependencies: [...(options?.dependencies ?? []), id, queryDependency],
      enabled: options?.enabled !== false && !!id,
    },
  );
}

/**
 * Create a new resource (mutation)
 *
 * @example
 * ```typescript
 * const { create, isLoading, error } = useCreate(getArticleService, {
 *   onSuccess: (data) => {
 *     notificationsService.success('Article created!');
 *     refresh(); // Refresh list
 *   }
 * });
 *
 * // Usage
 * await create({ title: 'New Article', content: '...' });
 * ```
 */
export function useCreate<T>(
  getService: () => Promise<BaseService<T>>,
  options?: MutationOptions<T>,
) {
  const { runMutation, isLoading, error } = useMutation<T>(getService);

  const create = useCallback(
    async (data: Partial<T>): Promise<T | null> =>
      runMutation(
        'POST resource',
        (service) => service.post(data),
        options?.onSuccess,
        options?.onError,
        'Failed to create resource',
      ),
    [runMutation, options?.onSuccess, options?.onError],
  );

  return { create, error, isLoading };
}

/**
 * Update an existing resource (mutation)
 *
 * @example
 * ```typescript
 * const { update, isLoading, error } = useUpdate(getArticleService, {
 *   onSuccess: (data) => {
 *     notificationsService.success('Article updated!');
 *     refresh(); // Refresh detail view
 *   }
 * });
 *
 * // Usage
 * await update(articleId, { title: 'Updated Title' });
 * ```
 */
export function useUpdate<T>(
  getService: () => Promise<BaseService<T>>,
  options?: MutationOptions<T>,
) {
  const { runMutation, isLoading, error } = useMutation<T>(getService);

  const update = useCallback(
    async (id: string, data: Partial<T>): Promise<T | null> =>
      runMutation(
        `PATCH resource ${id}`,
        (service) => service.patch(id, data),
        options?.onSuccess,
        options?.onError,
        'Failed to update resource',
      ),
    [runMutation, options?.onSuccess, options?.onError],
  );

  return { error, isLoading, update };
}

/**
 * Delete a resource (mutation)
 *
 * @example
 * ```typescript
 * const { delete: deleteResource, isLoading, error } = useDelete(getArticleService, {
 *   onSuccess: () => {
 *     notificationsService.success('Article deleted!');
 *     router.push('/articles'); // Navigate away
 *   }
 * });
 *
 * // Usage
 * await deleteResource(articleId);
 * ```
 */
export function useDelete<T>(
  getService: () => Promise<BaseService<T>>,
  options?: MutationOptions<void>,
) {
  const { runMutation, isLoading, error } = useMutation<T>(getService);

  const deleteResource = useCallback(
    async (id: string): Promise<void> => {
      await runMutation<void>(
        `DELETE resource ${id}`,
        async (service) => {
          await service.delete(id);
        },
        options?.onSuccess,
        options?.onError,
        'Failed to delete resource',
      );
    },
    [runMutation, options?.onSuccess, options?.onError],
  );

  return { delete: deleteResource, error, isLoading };
}
