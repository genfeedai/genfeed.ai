import type { GeneratedRoute } from '@genfeedai/tools';
import { LoggerService } from '@libs/logger/logger.service';
import { ConfigService } from '@mcp/config/config.service';
import { BaseApiClient } from '@mcp/services/client/base-api-client';
import { OpenApiClient } from '@mcp/services/client/openapi.client';
import { HttpService } from '@nestjs/axios';
import type { AxiosInstance } from 'axios';
import type { Mock } from 'vitest';

function makeRoute(overrides: Partial<GeneratedRoute> = {}): GeneratedRoute {
  return {
    bodyMode: 'none',
    bodyParams: [],
    isWrite: false,
    method: 'get',
    operationId: 'TestController.test',
    path: '/test',
    pathParams: [],
    queryParams: [],
    ...overrides,
  };
}

describe('OpenApiClient', () => {
  let client: OpenApiClient;
  let mockAxiosInstance: Partial<AxiosInstance>;

  beforeEach(() => {
    mockAxiosInstance = {
      defaults: {
        headers: { Authorization: '' },
      } as unknown as AxiosInstance['defaults'],
      delete: vi.fn(),
      get: vi.fn(),
      patch: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
    };

    const mockHttpService = {
      axiosRef: { create: vi.fn().mockReturnValue(mockAxiosInstance) },
    } as unknown as HttpService;

    const mockConfigService = {
      get: vi.fn((key: string) => {
        const config: Record<string, string> = {
          GENFEEDAI_API_KEY: 'test-api-key',
          GENFEEDAI_API_URL: 'https://api.genfeed.ai',
        };
        return config[key];
      }),
    } as unknown as ConfigService;

    const mockLoggerService = {
      debug: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    } as unknown as LoggerService;

    const base = new BaseApiClient(
      mockLoggerService,
      mockHttpService,
      mockConfigService,
    );
    client = new OpenApiClient(base);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('path parameter substitution', () => {
    it('substitutes a path param and encodes it', async () => {
      const route = makeRoute({
        method: 'get',
        path: '/activities/{activityId}',
        pathParams: ['activityId'],
      });

      (mockAxiosInstance.get as Mock).mockResolvedValue({
        data: { data: { id: 'act-1', status: 'done' } },
      });

      const result = await client.executeOperation(route, {
        activityId: 'a/b c',
      });

      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        '/activities/a%2Fb%20c',
        { params: {} },
      );
      expect(result).toEqual({ id: 'act-1', status: 'done' });
    });

    it('throws a clear error when a required path parameter is missing', async () => {
      const route = makeRoute({
        method: 'get',
        path: '/activities/{activityId}',
        pathParams: ['activityId'],
      });

      await expect(client.executeOperation(route, {})).rejects.toThrow(
        'Missing required path parameter: activityId',
      );
      expect(mockAxiosInstance.get).not.toHaveBeenCalled();
    });

    it('throws when a required path parameter is explicitly null', async () => {
      const route = makeRoute({
        method: 'get',
        path: '/activities/{activityId}',
        pathParams: ['activityId'],
      });

      await expect(
        client.executeOperation(route, { activityId: null }),
      ).rejects.toThrow('Missing required path parameter: activityId');
    });
  });

  describe('query parameters', () => {
    it('includes only defined query params', async () => {
      const route = makeRoute({
        method: 'get',
        path: '/activities',
        queryParams: ['limit', 'status'],
      });

      (mockAxiosInstance.get as Mock).mockResolvedValue({
        data: { data: [] },
      });

      await client.executeOperation(route, { limit: 10, status: undefined });

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/activities', {
        params: { limit: 10 },
      });
    });
  });

  describe('body assembly', () => {
    it('POST flat body includes only defined bodyParams keys', async () => {
      const route = makeRoute({
        bodyMode: 'flat',
        bodyParams: ['title', 'description'],
        isWrite: true,
        method: 'post',
        path: '/activities',
      });

      (mockAxiosInstance.post as Mock).mockResolvedValue({
        data: { data: { id: 'act-1' } },
      });

      await client.executeOperation(route, {
        description: undefined,
        extra: 'ignored',
        title: 'Hello',
      });

      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        '/activities',
        { title: 'Hello' },
        { params: {} },
      );
    });

    it('POST raw body passes args.body verbatim', async () => {
      const route = makeRoute({
        bodyMode: 'raw',
        isWrite: true,
        method: 'post',
        path: '/activities/bulk',
      });

      (mockAxiosInstance.post as Mock).mockResolvedValue({
        data: { data: { count: 2 } },
      });

      await client.executeOperation(route, {
        body: [{ title: 'A' }, { title: 'B' }],
      });

      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        '/activities/bulk',
        [{ title: 'A' }, { title: 'B' }],
        { params: {} },
      );
    });

    it('raw body defaults to {} when args.body is absent', async () => {
      const route = makeRoute({
        bodyMode: 'raw',
        isWrite: true,
        method: 'post',
        path: '/activities/bulk',
      });

      (mockAxiosInstance.post as Mock).mockResolvedValue({
        data: { data: {} },
      });

      await client.executeOperation(route, {});

      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        '/activities/bulk',
        {},
        { params: {} },
      );
    });

    it('PATCH/PUT dispatch through the body branch', async () => {
      const route = makeRoute({
        bodyMode: 'flat',
        bodyParams: ['status'],
        isWrite: true,
        method: 'patch',
        path: '/activities/{activityId}',
        pathParams: ['activityId'],
      });

      (mockAxiosInstance.patch as Mock).mockResolvedValue({
        data: { data: { id: 'act-1', status: 'closed' } },
      });

      await client.executeOperation(route, {
        activityId: 'act-1',
        status: 'closed',
      });

      expect(mockAxiosInstance.patch).toHaveBeenCalledWith(
        '/activities/act-1',
        { status: 'closed' },
        { params: {} },
      );
    });

    it('DELETE dispatches through the no-body branch', async () => {
      const route = makeRoute({
        isWrite: true,
        method: 'delete',
        path: '/activities/{activityId}',
        pathParams: ['activityId'],
      });

      (mockAxiosInstance.delete as Mock).mockResolvedValue({
        data: { data: { id: 'act-1' } },
      });

      await client.executeOperation(route, { activityId: 'act-1' });

      expect(mockAxiosInstance.delete).toHaveBeenCalledWith(
        '/activities/act-1',
        { params: {} },
      );
    });
  });

  describe('error propagation', () => {
    it('surfaces the API error detail verbatim on non-2xx', async () => {
      const route = makeRoute({
        method: 'get',
        path: '/activities/{activityId}',
        pathParams: ['activityId'],
      });

      (mockAxiosInstance.get as Mock).mockRejectedValue({
        message: 'Request failed with status code 404',
        response: {
          data: { errors: [{ detail: 'Activity not found' }] },
        },
      });

      await expect(
        client.executeOperation(route, { activityId: 'missing' }),
      ).rejects.toThrow('Activity not found');
    });

    it('falls back to a default message when no error detail is present', async () => {
      const route = makeRoute({
        method: 'get',
        path: '/activities/{activityId}',
        pathParams: ['activityId'],
      });

      (mockAxiosInstance.get as Mock).mockRejectedValue({
        message: 'Network error',
      });

      await expect(
        client.executeOperation(route, { activityId: 'a1' }),
      ).rejects.toThrow('Failed to execute TestController.test');
    });
  });
});
