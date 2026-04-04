import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import type React from 'react';

export interface ServiceOperationOptions<T> {
  /** URL pattern for logging (e.g., "DELETE /ingredients/123") */
  url: string;
  /** The async operation to perform */
  operation: () => Promise<T>;
  /** Message shown on success */
  successMessage: string;
  /** Message shown on error */
  errorMessage: string;
  /** Optional callback after success */
  onSuccess?: (result: T) => void;
  /** Whether to re-throw error (default: false) */
  rethrow?: boolean;
}

/**
 * Wrapper for service operations with consistent logging and notifications
 *
 * @example
 * ```typescript
 * await withServiceOperation({
 *   url: `DELETE /ingredients/${id}`,
 *   operation: () => service.delete(id),
 *   successMessage: 'Ingredient deleted successfully',
 *   errorMessage: 'Failed to delete ingredient',
 *   onSuccess: () => refetch(),
 * });
 * ```
 */
export async function withServiceOperation<T>({
  url,
  operation,
  successMessage,
  errorMessage,
  onSuccess,
  rethrow = false,
}: ServiceOperationOptions<T>): Promise<T | undefined> {
  const notificationsService = NotificationsService.getInstance();

  try {
    const result = await operation();
    logger.info(`${url} success`);
    notificationsService.success(successMessage);
    onSuccess?.(result);
    return result;
  } catch (error) {
    logger.error(`${url} failed`, error);
    notificationsService.error(errorMessage);
    if (rethrow) {
      throw error;
    }
    return undefined;
  }
}

/**
 * Silent version - logs but doesn't show notification on success
 * Useful for background operations
 */
export async function withSilentOperation<T>({
  url,
  operation,
  errorMessage,
  onSuccess,
  rethrow = false,
}: Omit<ServiceOperationOptions<T>, 'successMessage'>): Promise<T | undefined> {
  const notificationsService = NotificationsService.getInstance();

  try {
    const result = await operation();
    logger.debug(`${url} success`);
    onSuccess?.(result);
    return result;
  } catch (error) {
    logger.error(`${url} failed`, error);
    notificationsService.error(errorMessage);
    if (rethrow) {
      throw error;
    }
    return undefined;
  }
}

/**
 * Execute operation with loading state management
 * Use this when you need to track loading state in a component
 *
 * @example
 * ```typescript
 * const [isLoading, setIsLoading] = useState(false);
 *
 * const handleDelete = async (id: string) => {
 *   await executeWithLoading({
 *     setLoading: setIsLoading,
 *     url: `DELETE /items/${id}`,
 *     operation: () => service.delete(id),
 *     successMessage: 'Item deleted',
 *     errorMessage: 'Failed to delete item',
 *   });
 * };
 * ```
 */
export async function executeWithLoading<T>({
  setLoading,
  url,
  operation,
  successMessage,
  errorMessage,
  onSuccess,
  rethrow = false,
}: ServiceOperationOptions<T> & {
  setLoading: (loading: boolean) => void;
}): Promise<T | undefined> {
  setLoading(true);
  try {
    const result = await withServiceOperation({
      errorMessage,
      onSuccess,
      operation,
      rethrow,
      successMessage,
      url,
    });
    return result;
  } finally {
    setLoading(false);
  }
}

/**
 * Execute operation with action state object management
 * Use this when you have a state object with multiple boolean keys
 *
 * @example
 * ```typescript
 * const [actionStates, setActionStates] = useState({ isDeleting: false, isCloning: false });
 *
 * const handleDelete = async (id: string) => {
 *   await executeWithActionState({
 *     setActionStates,
 *     stateKey: 'isDeleting',
 *     url: `DELETE /items/${id}`,
 *     operation: () => service.delete(id),
 *     successMessage: 'Item deleted',
 *     errorMessage: 'Failed to delete item',
 *   });
 * };
 * ```
 */
export async function executeWithActionState<
  T,
  S extends Record<string, boolean>,
>({
  setActionStates,
  stateKey,
  url,
  operation,
  successMessage,
  errorMessage,
  onSuccess,
  rethrow = false,
}: ServiceOperationOptions<T> & {
  setActionStates: React.Dispatch<React.SetStateAction<S>>;
  stateKey: keyof S;
}): Promise<T | undefined> {
  setActionStates((prev) => ({ ...prev, [stateKey]: true }));
  try {
    const result = await withServiceOperation({
      errorMessage,
      onSuccess,
      operation,
      rethrow,
      successMessage,
      url,
    });
    return result;
  } finally {
    setActionStates((prev) => ({ ...prev, [stateKey]: false }));
  }
}

/**
 * Silent version with action state management
 * Logs but doesn't show success notification
 */
export async function executeSilentWithActionState<
  T,
  S extends Record<string, boolean>,
>({
  setActionStates,
  stateKey,
  url,
  operation,
  errorMessage,
  onSuccess,
  rethrow = false,
}: Omit<ServiceOperationOptions<T>, 'successMessage'> & {
  setActionStates: React.Dispatch<React.SetStateAction<S>>;
  stateKey: keyof S;
}): Promise<T | undefined> {
  setActionStates((prev) => ({ ...prev, [stateKey]: true }));
  try {
    const result = await withSilentOperation({
      errorMessage,
      onSuccess,
      operation,
      rethrow,
      url,
    });
    return result;
  } finally {
    setActionStates((prev) => ({ ...prev, [stateKey]: false }));
  }
}
