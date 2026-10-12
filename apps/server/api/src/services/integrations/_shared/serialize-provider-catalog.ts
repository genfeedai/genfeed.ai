import { HttpException, HttpStatus } from '@nestjs/common';
import { isAxiosError } from 'axios';
import { ZodError } from 'zod';

export type ProviderCatalogResponse<TType extends string, TAttributes> = {
  data: {
    attributes: TAttributes;
    type: TType;
  };
};

export type ProviderCatalogIdResponse<TType extends string, TAttributes> = {
  data: {
    attributes: TAttributes;
    id: string;
    type: TType;
  };
};

export function serializeProviderCatalog<
  TType extends string,
  TAttributes,
>(params: {
  attributes: TAttributes;
  id: string;
  type: TType;
}): ProviderCatalogIdResponse<TType, TAttributes>;
export function serializeProviderCatalog<
  TType extends string,
  TAttributes,
>(params: {
  attributes: TAttributes;
  type: TType;
}): ProviderCatalogResponse<TType, TAttributes>;
export function serializeProviderCatalog<TType extends string, TAttributes>({
  attributes,
  id,
  type,
}: {
  attributes: TAttributes;
  id?: string;
  type: TType;
}):
  | ProviderCatalogResponse<TType, TAttributes>
  | ProviderCatalogIdResponse<TType, TAttributes> {
  if (id === undefined) {
    return {
      data: {
        attributes,
        type,
      },
    };
  }

  return {
    data: {
      attributes,
      id,
      type,
    },
  };
}

export type ProviderCatalogFailureCategory =
  | 'provider_config'
  | 'provider_rejected'
  | 'provider_timeout'
  | 'provider_unavailable'
  | 'provider_invalid_response'
  | 'provider_unexpected';

export interface ProviderCatalogFailure {
  category: ProviderCatalogFailureCategory;
  detail: string;
  status: HttpStatus;
}

export interface ProviderCatalogDiagnostics {
  category: ProviderCatalogFailureCategory;
  errorCode?: string;
  errorName?: string;
  providerStatus?: number;
  status: HttpStatus;
}

const TIMEOUT_CODES = new Set(['ECONNABORTED', 'ETIMEDOUT', 'ERR_CANCELED']);

const FAILURES: Record<
  ProviderCatalogFailureCategory,
  Omit<ProviderCatalogFailure, 'category'>
> = {
  provider_config: {
    detail:
      'The provider credentials are missing or invalid. Reconnect the integration in Settings and try again.',
    status: HttpStatus.FAILED_DEPENDENCY,
  },
  provider_invalid_response: {
    detail:
      'The provider returned a response that could not be read. Try again shortly.',
    status: HttpStatus.BAD_GATEWAY,
  },
  provider_rejected: {
    detail:
      'The provider rejected the request. Check the integration and try again.',
    status: HttpStatus.BAD_GATEWAY,
  },
  provider_timeout: {
    detail: 'The provider did not respond in time. Try again shortly.',
    status: HttpStatus.GATEWAY_TIMEOUT,
  },
  provider_unavailable: {
    detail:
      'The provider is temporarily unavailable or rate limiting requests. Try again shortly.',
    status: HttpStatus.SERVICE_UNAVAILABLE,
  },
  provider_unexpected: {
    detail: 'An unexpected error occurred while loading the provider catalog.',
    status: HttpStatus.INTERNAL_SERVER_ERROR,
  },
};

function readErrorCode(error: unknown): string | undefined {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const { code } = error;
    return typeof code === 'string' ? code : undefined;
  }
  return undefined;
}

function classifyProviderStatus(
  providerStatus: number,
): ProviderCatalogFailureCategory {
  if (providerStatus === 401 || providerStatus === 403) {
    return 'provider_config';
  }
  if (providerStatus === 429 || providerStatus >= 500) {
    return 'provider_unavailable';
  }
  return 'provider_rejected';
}

function resolveCategory(error: unknown): {
  category: ProviderCatalogFailureCategory;
  providerStatus?: number;
} {
  if (isAxiosError(error)) {
    const providerStatus = error.response?.status;
    if (providerStatus !== undefined) {
      return {
        category: classifyProviderStatus(providerStatus),
        providerStatus,
      };
    }
    const code = error.code ?? '';
    if (TIMEOUT_CODES.has(code) || /timeout/i.test(error.message)) {
      return { category: 'provider_timeout' };
    }
    return { category: 'provider_unavailable' };
  }

  if (error instanceof ZodError) {
    return { category: 'provider_invalid_response' };
  }

  if (error instanceof Error && error.name === 'TimeoutError') {
    return { category: 'provider_timeout' };
  }

  return { category: 'provider_unexpected' };
}

/**
 * Maps a provider catalog failure to a safe, actionable client response.
 * Raw provider messages, payloads and credentials never reach the response.
 */
export function classifyProviderCatalogError(
  error: unknown,
): ProviderCatalogFailure {
  // Failures authored by our own services carry a safe, intentional message
  // and status (e.g. "Connect HeyGen to load identities.").
  if (error instanceof HttpException && error.getStatus() < 500) {
    const status = error.getStatus();
    return {
      category:
        status === HttpStatus.PAYMENT_REQUIRED
          ? 'provider_rejected'
          : 'provider_config',
      detail: error.message,
      status,
    };
  }

  const { category } = resolveCategory(error);
  return { category, ...FAILURES[category] };
}

/** Log-safe summary of a catalog failure: no message, headers or payload. */
export function describeProviderCatalogError(
  error: unknown,
): ProviderCatalogDiagnostics {
  const failure = classifyProviderCatalogError(error);
  return {
    category: failure.category,
    errorCode: readErrorCode(error),
    errorName: error instanceof Error ? error.name : typeof error,
    providerStatus: resolveCategory(error).providerStatus,
    status: failure.status,
  };
}

export function throwProviderCatalogError(
  title: string,
  error: unknown,
): never {
  const { category, detail, status } = classifyProviderCatalogError(error);

  throw new HttpException({ code: category, detail, title }, status);
}
