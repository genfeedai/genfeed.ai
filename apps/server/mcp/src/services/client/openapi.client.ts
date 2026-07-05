import type { GeneratedRoute } from '@genfeedai/tools';
import type { AxiosResponse } from 'axios';
import type { BaseApiClient } from './base-api-client';

/**
 * Generic HTTP dispatcher for OpenAPI-generated MCP tools (#1249 parity epic).
 *
 * Every generated tool carries a {@link GeneratedRoute} manifest entry instead
 * of a hand-written handler. This client turns that manifest plus a flat
 * `args` object into a concrete authenticated request against the shared
 * {@link BaseApiClient} axios instance — path substitution, query string, and
 * body assembly — with no per-endpoint code.
 */
export class OpenApiClient {
  constructor(private readonly base: BaseApiClient) {}

  async executeOperation(
    route: GeneratedRoute,
    args: Record<string, unknown>,
  ): Promise<unknown> {
    const resolvedPath = this.resolvePath(route, args);
    const params = this.buildQueryParams(route, args);
    const body = this.buildBody(route, args);

    return this.base.request(
      `executing generated operation ${route.operationId}`,
      async (http) => {
        let response: AxiosResponse;

        switch (route.method) {
          case 'get':
          case 'delete':
            response = await http[route.method](resolvedPath, { params });
            break;
          case 'post':
          case 'patch':
          case 'put':
            response = await http[route.method](resolvedPath, body, {
              params,
            });
            break;
          default: {
            const exhaustiveCheck: never = route.method;
            throw new Error(`Unsupported HTTP method: ${exhaustiveCheck}`);
          }
        }

        return this.base.unwrapData(response);
      },
      this.base.failWithDetail(`Failed to execute ${route.operationId}`),
    );
  }

  private resolvePath(
    route: GeneratedRoute,
    args: Record<string, unknown>,
  ): string {
    let resolvedPath = route.path;

    for (const pathParam of route.pathParams) {
      const value = args[pathParam];
      if (value === undefined || value === null) {
        throw new Error(`Missing required path parameter: ${pathParam}`);
      }
      resolvedPath = resolvedPath.replace(
        `{${pathParam}}`,
        encodeURIComponent(String(value)),
      );
    }

    return resolvedPath;
  }

  private buildQueryParams(
    route: GeneratedRoute,
    args: Record<string, unknown>,
  ): Record<string, unknown> {
    const params: Record<string, unknown> = {};

    for (const queryParam of route.queryParams) {
      const value = args[queryParam];
      if (value !== undefined) {
        params[queryParam] = value;
      }
    }

    return params;
  }

  private buildBody(
    route: GeneratedRoute,
    args: Record<string, unknown>,
  ): Record<string, unknown> | undefined {
    switch (route.bodyMode) {
      case 'none':
        return undefined;
      case 'flat': {
        const body: Record<string, unknown> = {};
        for (const bodyParam of route.bodyParams) {
          const value = args[bodyParam];
          if (value !== undefined) {
            body[bodyParam] = value;
          }
        }
        return body;
      }
      case 'raw':
        return (args.body as Record<string, unknown> | undefined) ?? {};
      default: {
        const exhaustiveCheck: never = route.bodyMode;
        throw new Error(`Unsupported body mode: ${exhaustiveCheck}`);
      }
    }
  }
}
