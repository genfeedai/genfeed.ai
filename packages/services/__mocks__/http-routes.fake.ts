/**
 * Route-table stand-in for a service's axios instance.
 *
 * A spec declares the routes the server exposes (`'GET /brand/b1/health'`,
 * `'POST /c1/refresh'`) and asserts on what the service returns. A request to
 * an undeclared method, path or query string fails with a 404, so a service
 * that builds the wrong URL fails on its result instead of on a call check.
 * An aborted `signal` rejects the request the way axios does.
 */
export type FakeRouteHandler = (body: unknown) => unknown;

export interface FakeHttpRoutes {
  /** Bodies received per route key, in order. */
  bodies: Record<string, unknown[]>;
}

type RequestConfig = {
  data?: unknown;
  params?: Record<string, unknown>;
  signal?: AbortSignal;
};

function routeKey(
  method: string,
  path: string,
  params?: Record<string, unknown>,
): string {
  const query = new URLSearchParams(
    Object.entries(params ?? {})
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => [key, String(value)]),
  ).toString();
  return `${method} ${path}${query ? `?${query}` : ''}`;
}

export function installFakeHttpRoutes(
  service: unknown,
  routes: Record<string, unknown | FakeRouteHandler>,
): FakeHttpRoutes {
  const state: FakeHttpRoutes = { bodies: {} };
  const handle = async (
    method: string,
    path: string,
    body: unknown,
    config: RequestConfig = {},
  ) => {
    if (config.signal?.aborted) {
      throw Object.assign(new Error('canceled'), { name: 'CanceledError' });
    }
    const key = routeKey(method, path, config.params);
    if (!(key in routes)) {
      throw new Error(`404: no route for ${key}`);
    }
    state.bodies[key] = [...(state.bodies[key] ?? []), body];
    const route = routes[key];
    return {
      data:
        typeof route === 'function' ? (route as FakeRouteHandler)(body) : route,
    };
  };

  (service as { instance: unknown }).instance = {
    delete: (path: string, config?: RequestConfig) =>
      handle('DELETE', path, config?.data, config),
    get: (path: string, config?: RequestConfig) =>
      handle('GET', path, undefined, config),
    patch: (path: string, body?: unknown, config?: RequestConfig) =>
      handle('PATCH', path, body, config),
    post: (path: string, body?: unknown, config?: RequestConfig) =>
      handle('POST', path, body, config),
    put: (path: string, body?: unknown, config?: RequestConfig) =>
      handle('PUT', path, body, config),
  };
  return state;
}
