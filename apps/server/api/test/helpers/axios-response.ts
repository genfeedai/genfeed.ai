import type { AxiosRequestHeaders, AxiosResponse } from 'axios';

/**
 * A complete `200 OK` axios response carrying `data`, for `HttpService` stubs.
 * Type-only axios import: the unit setup mocks the `axios` module.
 */
export function axiosResponse<T>(
  data: T,
  overrides: Partial<AxiosResponse<T>> = {},
): AxiosResponse<T> {
  return {
    config: { headers: {} as AxiosRequestHeaders },
    data,
    headers: {},
    status: 200,
    statusText: 'OK',
    ...overrides,
  };
}
