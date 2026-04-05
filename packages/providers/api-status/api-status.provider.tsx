'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import { EnvironmentService } from '@services/core/environment.service';
import { logger } from '@services/core/logger.service';
import Button from '@ui/buttons/base/Button';
import { Code } from '@ui/src/primitives/code';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { HiArrowPath, HiExclamationTriangle } from 'react-icons/hi2';

export type ApiStatus = 'checking' | 'connected' | 'error';

interface ApiHealthCacheEntry {
  endpoint: string;
  error: string | null;
  status: ApiStatus;
  timestamp: number;
}

interface ApiStatusContextValue {
  status: ApiStatus;
  error: string | null;
  retry: () => void;
}

const ApiStatusContext = createContext<ApiStatusContextValue | null>(null);
const API_HEALTH_CACHE_TTL_MS = 60_000;

let lastApiHealthCheck: ApiHealthCacheEntry | null = null;

export function useApiStatus(): ApiStatusContextValue {
  const context = useContext(ApiStatusContext);
  if (!context) {
    throw new Error('useApiStatus must be used within ApiStatusProvider');
  }
  return context;
}

interface ApiStatusProviderProps {
  children: ReactNode;
}

/**
 * Provider that checks API connectivity before rendering children.
 * Shows a full-screen error if the API is unreachable.
 */
export default function ApiStatusProvider({
  children,
}: ApiStatusProviderProps): ReactNode {
  const [status, setStatus] = useState<ApiStatus>('checking');
  const [error, setError] = useState<string | null>(null);

  const checkApiHealth = useCallback(async (force = false) => {
    setStatus('checking');
    setError(null);

    const apiEndpoint = EnvironmentService.apiEndpoint;
    const now = Date.now();

    if (
      !force &&
      lastApiHealthCheck &&
      lastApiHealthCheck.endpoint === apiEndpoint &&
      now - lastApiHealthCheck.timestamp < API_HEALTH_CACHE_TTL_MS
    ) {
      setStatus(lastApiHealthCheck.status);
      setError(lastApiHealthCheck.error);
      return;
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(`${apiEndpoint}/health`, {
        method: 'GET',
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.ok || response.status === 404) {
        lastApiHealthCheck = {
          endpoint: apiEndpoint,
          error: null,
          status: 'connected',
          timestamp: now,
        };
        setStatus('connected');
        logger.info('API connection established', { endpoint: apiEndpoint });
      } else {
        throw new Error(`API returned status ${response.status}`);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';

      const resolvedError =
        errorMessage.includes('Failed to fetch') ||
        errorMessage.includes('NetworkError') ||
        errorMessage.includes('ERR_CONNECTION_REFUSED') ||
        errorMessage.includes('aborted')
          ? `Cannot connect to API at ${apiEndpoint}`
          : errorMessage;

      lastApiHealthCheck = {
        endpoint: apiEndpoint,
        error: resolvedError,
        status: 'error',
        timestamp: now,
      };

      if (
        errorMessage.includes('Failed to fetch') ||
        errorMessage.includes('NetworkError') ||
        errorMessage.includes('ERR_CONNECTION_REFUSED') ||
        errorMessage.includes('aborted')
      ) {
        setError(resolvedError);
      } else {
        setError(resolvedError);
      }

      setStatus('error');
      logger.error('API connection failed', {
        endpoint: apiEndpoint,
        error: errorMessage,
      });
    }
  }, []);

  useEffect(() => {
    checkApiHealth();
  }, [checkApiHealth]);

  const contextValue = useMemo(
    () => ({
      error,
      retry: checkApiHealth,
      status,
    }),
    [status, error, checkApiHealth],
  );

  // Show error state if API is unreachable
  if (status === 'error') {
    return (
      <ApiStatusContext.Provider value={contextValue}>
        <div className="fixed inset-0 flex items-center justify-center bg-background p-4">
          <div className="max-w-md w-full text-center space-y-6">
            <div className="mx-auto flex items-center justify-center w-16 h-16 bg-error/10">
              <HiExclamationTriangle className="w-8 h-8 text-error" />
            </div>

            <div className="space-y-2">
              <h1 className="text-2xl font-bold">Cannot Connect to API</h1>
              <p className="text-foreground/70">
                The application cannot reach the backend server. This usually
                means the API is not running.
              </p>
            </div>

            <div className="bg-white/5 p-4 text-left space-y-2">
              <p className="text-sm font-medium text-foreground/70">
                Trying to connect to:
              </p>
              <Code display="block" size="sm" className="text-foreground/80 break-all">
                {EnvironmentService.apiEndpoint}
              </Code>
              {error && (
                <p className="text-xs text-foreground/50 mt-2">
                  Error: {error}
                </p>
              )}
            </div>

            <div className="space-y-3">
              <p className="text-sm text-foreground/60">
                If you&apos;re developing locally, start the backend:
              </p>
              <Code display="block" size="md">
                bun run dev:backend
              </Code>
            </div>

            <Button
              label="Try Again"
              variant={ButtonVariant.DEFAULT}
              size={ButtonSize.LG}
              onClick={() => void checkApiHealth(true)}
              className="gap-2"
            >
              <HiArrowPath className="w-4 h-4" />
              Try Again
            </Button>
          </div>
        </div>
      </ApiStatusContext.Provider>
    );
  }

  // API is connected, render children
  return (
    <ApiStatusContext.Provider value={contextValue}>
      {children}
    </ApiStatusContext.Provider>
  );
}
