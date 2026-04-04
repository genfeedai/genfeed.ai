import type {
  IAbortControllerConfig,
  IUseAbortController,
} from '@genfeedai/interfaces';
import { logger } from '@services/core/logger.service';
import type { DependencyList } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Custom hook for managing AbortController in useEffect hooks
 * Automatically creates an AbortController and aborts on unmount
 *
 * @example
 * ```tsx
 * const abortController = useAbortController([dependency1, dependency2]);
 *
 * useEffect(() => {
 *   const fetchData = async () => {
 *     try {
 *       const response = await fetch('/api/data', { signal: abortController.signal });
 *       if (!abortController.signal.aborted) {
 *         // Update state only if not aborted
 *       }
 *     } catch (error) {
 *       if (error.name !== 'AbortError') {
 *         // Handle non-abort errors
 *       }
 *     }
 *   };
 *
 *   fetchData();
 * }, [dependency1, dependency2]);
 * ```
 */
export function useAbortController(dependencies: DependencyList = []) {
  const abortControllerRef = useRef<AbortController | null>(null);
  const [currentController, setCurrentController] = useState<AbortController>(
    () => new AbortController(),
  );

  useEffect(() => {
    // Abort previous controller
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // Create new AbortController
    const newController = new AbortController();
    abortControllerRef.current = newController;
    setCurrentController(newController);

    // Cleanup function to abort on unmount or dependency change
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, dependencies);

  return currentController;
}

/**
 * Enhanced abort controller hook with configuration options
 */
export function useAbortControllerEnhanced(
  config?: IAbortControllerConfig,
): IUseAbortController {
  const {
    timeout,
    reason = 'Component unmounted',
    autoAbort = true,
  } = config || {};

  const controllerRef = useRef<AbortController | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [_isAborted, setIsAborted] = useState(false);

  const abort = useCallback(
    (abortReason?: string) => {
      if (controllerRef.current && !controllerRef.current.signal.aborted) {
        const finalReason = abortReason || reason;
        logger.debug('Aborting request:', finalReason);
        controllerRef.current.abort(finalReason);
        setIsAborted(true);
      }

      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    },
    [reason],
  );

  const getController = useCallback(() => {
    if (!controllerRef.current) {
      controllerRef.current = new AbortController();
      setIsAborted(false);

      if (timeout) {
        timeoutRef.current = setTimeout(() => {
          abort(`Request timeout after ${timeout}ms`);
        }, timeout);
      }
    }
    return controllerRef.current;
  }, [timeout, abort]);

  const reset = useCallback(() => {
    if (controllerRef.current && !controllerRef.current.signal.aborted) {
      abort('Resetting controller');
    }

    controllerRef.current = null;

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    getController();
  }, [abort, getController]);

  useEffect(() => {
    getController();

    return () => {
      if (
        autoAbort &&
        controllerRef.current &&
        !controllerRef.current.signal.aborted
      ) {
        logger.debug('Auto-aborting on unmount');
        controllerRef.current.abort(reason);
      }

      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [autoAbort, getController, reason]);

  // Store the signal reference to avoid creating a new controller
  const currentSignal = controllerRef.current?.signal ?? getController().signal;

  return {
    abort,
    get isAborted() {
      return controllerRef.current?.signal.aborted ?? false;
    },
    reset,
    signal: currentSignal,
  };
}

/**
 * Hook for managing multiple abort controllers
 */
export function useMultipleAbortControllers(
  keys: string[],
  config?: IAbortControllerConfig,
): Record<string, IUseAbortController> {
  const controllersRef = useRef<Record<string, AbortController>>({});
  const timeoutsRef = useRef<Record<string, NodeJS.Timeout>>({});
  const [_abortedStates, setAbortedStates] = useState<Record<string, boolean>>(
    {},
  );

  const {
    timeout,
    reason = 'Component unmounted',
    autoAbort = true,
  } = config || {};

  const abortForKey = useCallback(
    (key: string, abortReason?: string) => {
      if (
        controllersRef.current[key] &&
        !controllersRef.current[key].signal.aborted
      ) {
        const finalReason = abortReason || reason;
        logger.debug(`Aborting request for ${key}:`, finalReason);
        controllersRef.current[key].abort(finalReason);
        setAbortedStates((prev) => ({ ...prev, [key]: true }));
      }

      if (timeoutsRef.current[key]) {
        clearTimeout(timeoutsRef.current[key]);
        delete timeoutsRef.current[key];
      }
    },
    [reason],
  );

  const getController = useCallback(
    (key: string) => {
      if (!controllersRef.current[key]) {
        controllersRef.current[key] = new AbortController();
        setAbortedStates((prev) => ({ ...prev, [key]: false }));

        if (timeout) {
          timeoutsRef.current[key] = setTimeout(() => {
            abortForKey(key, `Request timeout after ${timeout}ms`);
          }, timeout);
        }
      }
      return controllersRef.current[key];
    },
    [timeout, abortForKey],
  );

  const resetForKey = useCallback(
    (key: string) => {
      if (
        controllersRef.current[key] &&
        !controllersRef.current[key].signal.aborted
      ) {
        abortForKey(key, 'Resetting controller');
      }

      delete controllersRef.current[key];

      if (timeoutsRef.current[key]) {
        clearTimeout(timeoutsRef.current[key]);
        delete timeoutsRef.current[key];
      }

      getController(key);
    },
    [abortForKey, getController],
  );

  const abortAll = useCallback(
    (abortReason?: string) => {
      Object.keys(controllersRef.current).forEach((key) => {
        abortForKey(key, abortReason);
      });
    },
    [abortForKey],
  );

  useEffect(() => {
    keys.forEach((key) => {
      getController(key);
    });

    return () => {
      if (autoAbort) {
        logger.debug('Auto-aborting all controllers on unmount');
        abortAll(reason);
      }

      Object.values(timeoutsRef.current).forEach(clearTimeout);
    };
  }, [abortAll, autoAbort, getController, keys.forEach, reason]);

  const result: Record<
    string,
    IUseAbortController & { abortAll?: (reason?: string) => void }
  > = {};
  keys.forEach((key) => {
    result[key] = {
      abort: (abortReason?: string) => abortForKey(key, abortReason),
      abortAll: (reason?: string) => abortAll(reason),
      get isAborted() {
        return controllersRef.current[key]?.signal.aborted ?? false;
      },
      reset: () => resetForKey(key),
      signal: getController(key).signal,
    };
  });

  return result;
}

/**
 * Utility function to check if an error is an AbortError
 */
export function isAbortError(error: unknown): boolean {
  if (error instanceof DOMException) {
    return error.name === 'AbortError';
  }
  return error instanceof Error && error.name === 'AbortError';
}

/**
 * Higher-order function that wraps an async function with abort signal handling
 *
 * @example
 * ```tsx
 * const safeFetch = withAbortSignal(async (signal) => {
 *   const response = await fetch('/api/data', { signal });
 *   return response.json();
 * });
 * ```
 */
export function withAbortSignal<T>(
  asyncFn: (signal: AbortSignal) => Promise<T>,
) {
  return async (signal: AbortSignal): Promise<T | null> => {
    if (signal.aborted) {
      return null;
    }

    try {
      return await asyncFn(signal);
    } catch (error) {
      if (!isAbortError(error)) {
        throw error;
      }
      return null;
    }
  };
}

/**
 * Hook for combining multiple abort signals
 */
export function useCombinedAbortSignal(
  signals: (AbortSignal | undefined)[],
  config?: IAbortControllerConfig,
): AbortSignal {
  const { reason = 'One of the signals was aborted' } = config || {};
  const controllerRef = useRef<AbortController>(new AbortController());

  useEffect(() => {
    const controller = controllerRef.current;
    const validSignals = signals.filter(Boolean) as AbortSignal[];

    if (validSignals.some((signal) => signal.aborted)) {
      return controller.abort(reason);
    }

    const handlers = validSignals.map((signal) => {
      const handler = () => {
        if (!controller.signal.aborted) {
          controller.abort(reason);
        }
      };
      signal.addEventListener('abort', handler);
      return { handler, signal };
    });

    return () => {
      handlers.forEach(({ signal, handler }) => {
        signal.removeEventListener('abort', handler);
      });
    };
  }, [reason, signals.filter]);

  return controllerRef.current.signal;
}

/**
 * Wrap a promise with abort and timeout support
 */
export async function withAbortAndTimeout<T>(
  promise: Promise<T>,
  signal: AbortSignal,
  timeoutMs?: number,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    if (signal.aborted) {
      return reject(new DOMException('Operation aborted', 'AbortError'));
    }

    let timeoutId: NodeJS.Timeout | undefined;

    const abortHandler = () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      reject(new DOMException('Operation aborted', 'AbortError'));
    };
    signal.addEventListener('abort', abortHandler);

    if (timeoutMs) {
      timeoutId = setTimeout(() => {
        signal.removeEventListener('abort', abortHandler);
        reject(
          new DOMException(
            `Operation timed out after ${timeoutMs}ms`,
            'TimeoutError',
          ),
        );
      }, timeoutMs);
    }

    promise
      .then((result) => {
        signal.removeEventListener('abort', abortHandler);
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        resolve(result);
      })
      .catch((error) => {
        signal.removeEventListener('abort', abortHandler);
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        reject(error);
      });
  });
}
