import type { IncomingMessage, ServerResponse } from 'node:http';

export interface CloudTenantObserver {
  protocol: 1;
  bindRequest(request: IncomingMessage, next: () => void): () => void;
  tenantFailure(model: string, operation: string, reason: string): void;
  ingress(request: IncomingMessage, response: ServerResponse): void;
  pipelineEnter(request: IncomingMessage): number | undefined;
  pipelineNext(request: IncomingMessage, entry: number): void;
  pipelineError(request: IncomingMessage, entry: number, error: unknown): void;
  pipelineFinalize(request: IncomingMessage, entry: number): void;
  unavailable(): void;
}
export const CLOUD_TENANT_OBSERVER = Symbol.for(
  'genfeed.cloudTenantGuard.observer.v1',
);
const methods = [
  'ingress',
  'bindRequest',
  'tenantFailure',
  'pipelineEnter',
  'pipelineNext',
  'pipelineError',
  'pipelineFinalize',
  'unavailable',
] as const;
export function getCloudTenantObserver(): CloudTenantObserver | undefined {
  const env = process.env;
  if (
    Reflect.get(env, 'CLOUD_SWEEP_DIAGNOSTICS') !== '1' ||
    env.CI !== 'true' ||
    env.GITHUB_ACTIONS !== 'true' ||
    env.GENFEED_CLOUD !== 'true' ||
    env.NODE_ENV !== 'test' ||
    Reflect.get(env, 'CLOUD_SWEEP_LOCAL') !== undefined
  )
    return undefined;
  try {
    const value: unknown = Reflect.get(globalThis, CLOUD_TENANT_OBSERVER);
    if (
      !value ||
      typeof value !== 'object' ||
      Reflect.get(value, 'protocol') !== 1 ||
      Object.keys(value).sort().join(',') !==
        ['protocol', ...methods].sort().join(',') ||
      methods.some((method) => typeof Reflect.get(value, method) !== 'function')
    )
      return undefined;
    return value as CloudTenantObserver;
  } catch {
    return undefined;
  }
}
export function observeCloudTenant<T>(
  observer: CloudTenantObserver | undefined,
  operation: (value: CloudTenantObserver) => T,
): T | undefined {
  if (!observer) return undefined;
  try {
    return operation(observer);
  } catch {
    try {
      observer.unavailable();
    } catch {
      /* Observation cannot change a request outcome. */
    }
    return undefined;
  }
}
