import { logger } from '@genfeedai/services/core/logger.service';
import { NotificationsService } from '@genfeedai/services/core/notifications.service';
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

type ActionStateOptions<S extends Record<string, boolean>> = {
  setActionStates: React.Dispatch<React.SetStateAction<S>>;
  stateKey: keyof S;
};

type ServiceOperationLogLevel = 'debug' | 'info';

type ServiceOperationRunnerOptions<T> = Omit<
  ServiceOperationOptions<T>,
  'successMessage'
> & {
  isSuccessNotificationEnabled?: boolean;
  successLogLevel: ServiceOperationLogLevel;
  successMessage?: string;
};

type ActionStateScopeOptions<T, S extends Record<string, boolean>> = {
  actionState: ActionStateOptions<S>;
  operation: () => Promise<T | undefined>;
};

function logServiceOperationSuccess(
  url: string,
  level: ServiceOperationLogLevel,
) {
  if (level === 'debug') {
    logger.debug(`${url} success`);
    return;
  }

  logger.info(`${url} success`);
}

async function runServiceOperation<T>({
  url,
  operation,
  successMessage,
  errorMessage,
  onSuccess,
  isSuccessNotificationEnabled = false,
  successLogLevel,
  rethrow = false,
}: ServiceOperationRunnerOptions<T>): Promise<T | undefined> {
  const notificationsService = NotificationsService.getInstance();

  try {
    const result = await operation();
    logServiceOperationSuccess(url, successLogLevel);
    if (isSuccessNotificationEnabled) {
      notificationsService.success(successMessage ?? '');
    }
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

function setActionState<S extends Record<string, boolean>>(
  { setActionStates, stateKey }: ActionStateOptions<S>,
  isActive: boolean,
) {
  setActionStates((prev) => ({ ...prev, [stateKey]: isActive }));
}

async function executeWithActionStateScope<
  T,
  S extends Record<string, boolean>,
>({
  actionState,
  operation,
}: ActionStateScopeOptions<T, S>): Promise<T | undefined> {
  setActionState(actionState, true);
  try {
    return await operation();
  } finally {
    setActionState(actionState, false);
  }
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
  return runServiceOperation({
    errorMessage,
    isSuccessNotificationEnabled: true,
    onSuccess,
    operation,
    rethrow,
    successLogLevel: 'info',
    successMessage,
    url,
  });
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
  return runServiceOperation({
    errorMessage,
    onSuccess,
    operation,
    rethrow,
    successLogLevel: 'debug',
    url,
  });
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
  return executeWithActionStateScope({
    actionState: {
      setActionStates,
      stateKey,
    },
    operation: () =>
      withServiceOperation({
        errorMessage,
        onSuccess,
        operation,
        rethrow,
        successMessage,
        url,
      }),
  });
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
  return executeWithActionStateScope({
    actionState: {
      setActionStates,
      stateKey,
    },
    operation: () =>
      withSilentOperation({
        errorMessage,
        onSuccess,
        operation,
        rethrow,
        url,
      }),
  });
}
