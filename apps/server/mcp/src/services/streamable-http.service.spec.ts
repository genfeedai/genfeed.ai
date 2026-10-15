import { LoggerService } from '@libs/logger/logger.service';
import { ConfigService } from '@mcp/config/config.service';
import { PostHogAnalyticsService } from '@mcp/services/posthog-analytics.service';
import { StreamableHttpService } from '@mcp/services/streamable-http.service';
import { HttpService } from '@nestjs/axios';
import { Test, TestingModule } from '@nestjs/testing';
import type { Request, Response } from 'express';

const {
  serverInstances,
  handlerInstances,
  mockHandleRequest,
  toolRegistryConstructorCalls,
} = vi.hoisted(() => ({
  serverInstances: [] as Array<{ setRequestHandler: ReturnType<typeof vi.fn> }>,
  handlerInstances: [] as Array<{
    close: ReturnType<typeof vi.fn>;
    factory: () => unknown;
    options: unknown;
  }>,
  toolRegistryConstructorCalls: [] as unknown[][],
  mockHandleRequest: vi.fn(),
}));

vi.mock('@modelcontextprotocol/server', () => ({
  Server: class MockServer {
    setRequestHandler = vi.fn();
    constructor() {
      serverInstances.push(this);
    }
  },
  createMcpHandler: (factory: () => unknown, options: unknown) => {
    const handler = {
      close: vi.fn().mockResolvedValue(undefined),
      factory,
      options,
    };
    handlerInstances.push(handler);
    return handler;
  },
}));

vi.mock('@modelcontextprotocol/node', () => ({
  toNodeHandler:
    (handler: { factory: () => unknown }) =>
    async (...args: unknown[]) => {
      await handler.factory();
      await mockHandleRequest(...args);
    },
}));

const mockSetBearerToken = vi.fn();
const mockInstrumentServer = vi.fn();
const mockGetPublicResources = vi
  .fn()
  .mockReturnValue([
    { name: 'Agent guide', uri: 'https://genfeed.ai/llms.txt' },
  ]);
vi.mock('@mcp/services/client.service', () => ({
  ClientService: class MockClientService {
    setBearerToken = mockSetBearerToken;
  },
}));

vi.mock('@mcp/services/tool-registry.service', () => ({
  ToolRegistryService: class MockToolRegistryService {
    getResources = vi.fn().mockReturnValue([]);
    getPublicResources = mockGetPublicResources;
    getTools = vi.fn().mockReturnValue([]);
    handleResourceRead = vi.fn();
    handleToolCall = vi.fn();
    constructor(...args: unknown[]) {
      toolRegistryConstructorCalls.push(args);
    }
  },
}));

function makeReq(overrides: Partial<Request> = {}): Request {
  return {
    headers: {},
    ...overrides,
  } as unknown as Request;
}

/**
 * `ToolRegistryService`'s constructor args are captured positionally (the
 * mock has no parameter names to key off of), but asserting a fixed index is
 * fragile against constructor reordering. The toolset selection is the only
 * array-shaped argument (client service and logger are objects, role is a
 * string), so finding it by shape is a cleaner, reorder-safe assertion.
 */
function getConstructedToolsets(callIndex = 0): unknown {
  return toolRegistryConstructorCalls[callIndex]?.find((arg) =>
    Array.isArray(arg),
  );
}

function makeRes(): Response & {
  status: ReturnType<typeof vi.fn>;
  json: ReturnType<typeof vi.fn>;
  headersSent: boolean;
} {
  const res = {
    headersSent: false,
    json: vi.fn(),
    status: vi.fn(),
  } as unknown as Response & {
    status: ReturnType<typeof vi.fn>;
    json: ReturnType<typeof vi.fn>;
    headersSent: boolean;
  };
  (res.status as ReturnType<typeof vi.fn>).mockReturnValue(res);
  return res;
}

describe('StreamableHttpService', () => {
  let service: StreamableHttpService;

  beforeEach(async () => {
    vi.clearAllMocks();
    serverInstances.length = 0;
    handlerInstances.length = 0;
    toolRegistryConstructorCalls.length = 0;
    mockHandleRequest.mockReset();
    mockHandleRequest.mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StreamableHttpService,
        {
          provide: LoggerService,
          useValue: {
            debug: vi.fn(),
            error: vi.fn(),
            log: vi.fn(),
            warn: vi.fn(),
          },
        },
        { provide: HttpService, useValue: { axiosRef: { create: vi.fn() } } },
        {
          provide: ConfigService,
          useValue: {
            get: vi.fn((key: string) =>
              key === 'GENFEEDAI_API_URL' ? 'http://localhost:3000' : '',
            ),
          },
        },
        {
          provide: PostHogAnalyticsService,
          useValue: { instrumentServer: mockInstrumentServer },
        },
      ],
    }).compile();

    service = module.get<StreamableHttpService>(StreamableHttpService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('transport readiness', () => {
    it('is not ready until the bootstrap mounts the /mcp routes', () => {
      expect(service.isTransportReady()).toBe(false);
    });

    it('is ready once the routes are mounted', () => {
      service.markTransportMounted();

      expect(service.isTransportReady()).toBe(true);
    });

    it('does not become ready merely by serving a request', async () => {
      await service.handlePost(makeReq({ headers: {} }), makeRes());

      expect(service.isTransportReady()).toBe(false);
    });
  });

  describe('handlePost', () => {
    it('builds a fresh stateless server + transport per request and handles it', async () => {
      const req = makeReq({ headers: {} });
      const res = makeRes();

      await service.handlePost(req, res);

      expect(serverInstances).toHaveLength(1);
      expect(handlerInstances).toHaveLength(1);
      // The SDK owns both modern dispatch and stateless legacy compatibility.
      expect(handlerInstances[0].options).toMatchObject({
        legacy: 'stateless',
        responseMode: 'auto',
      });
      expect(mockHandleRequest).toHaveBeenCalledWith(req, res, undefined);
    });

    it('closes the request handler after every request', async () => {
      await service.handlePost(makeReq({ headers: {} }), makeRes());

      expect(handlerInstances[0].close).toHaveBeenCalledOnce();
    });

    it('creates an independent transport per request (no reuse)', async () => {
      await service.handlePost(makeReq({ headers: {} }), makeRes());
      await service.handlePost(makeReq({ headers: {} }), makeRes());

      expect(handlerInstances).toHaveLength(2);
      expect(serverInstances).toHaveLength(2);
      expect(handlerInstances[0]).not.toBe(handlerInstances[1]);
    });

    it('forwards a parsed body to the transport when present', async () => {
      const body = { id: 1, jsonrpc: '2.0', method: 'initialize' };
      const req = makeReq({ body } as unknown as Partial<Request>);
      const res = makeRes();

      await service.handlePost(req, res);

      expect(mockHandleRequest).toHaveBeenCalledWith(req, res, body);
    });

    it('propagates the bearer token from authContext to the client', async () => {
      const req = makeReq({
        authContext: { token: 'bearer-xyz' },
      } as unknown as Partial<Request>);

      await service.handlePost(req, makeRes());

      expect(mockSetBearerToken).toHaveBeenCalledWith('bearer-xyz');
    });

    it('threads the request-scoped toolset selection into the registry', async () => {
      const req = makeReq({
        toolsets: ['content'],
      } as unknown as Partial<Request>);

      await service.handlePost(req, makeRes());

      expect(getConstructedToolsets()).toEqual(['content']);
    });

    it('defaults to an empty toolset selection ("every tool") when unset', async () => {
      await service.handlePost(makeReq({ headers: {} }), makeRes());

      expect(getConstructedToolsets()).toEqual([]);
    });

    it('instruments the request server with the authenticated identity', async () => {
      const authContext = {
        organizationId: 'organization-123',
        role: 'admin' as const,
        token: 'bearer-xyz',
        userId: 'user-123',
      };
      const req = makeReq({ authContext } as unknown as Partial<Request>);

      await service.handlePost(req, makeRes());

      expect(mockInstrumentServer).toHaveBeenCalledWith(
        serverInstances[0],
        authContext,
      );
    });

    it('lists only public resources for an unauthenticated discovery request', async () => {
      await service.handlePost(makeReq({ headers: {} }), makeRes());
      const registration = serverInstances[0].setRequestHandler.mock.calls.find(
        ([schema]) => schema === 'resources/list',
      );
      const handler = registration?.[1] as () => unknown;

      expect(handler()).toEqual({
        resources: [
          { name: 'Agent guide', uri: 'https://genfeed.ai/llms.txt' },
        ],
      });
      expect(mockGetPublicResources).toHaveBeenCalledOnce();
    });

    it('responds 500 and still tears down when handleRequest throws', async () => {
      mockHandleRequest.mockRejectedValueOnce(new Error('boom'));
      const res = makeRes();

      await service.handlePost(makeReq({ headers: {} }), res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(handlerInstances[0].close).toHaveBeenCalledOnce();
    });
  });

  describe('handleGet / handleDelete', () => {
    it('routes GET through the same stateless per-request handler', async () => {
      const req = makeReq({ headers: {} });
      const res = makeRes();

      await service.handleGet(req, res);

      expect(handlerInstances).toHaveLength(1);
      expect(mockHandleRequest).toHaveBeenCalledWith(req, res, undefined);
      expect(handlerInstances[0].close).toHaveBeenCalledOnce();
    });

    it('routes DELETE through the same stateless per-request handler', async () => {
      const req = makeReq({ headers: {} });
      const res = makeRes();

      await service.handleDelete(req, res);

      expect(handlerInstances).toHaveLength(1);
      expect(mockHandleRequest).toHaveBeenCalledWith(req, res, undefined);
      expect(handlerInstances[0].close).toHaveBeenCalledOnce();
    });
  });
  it.each([
    {
      authContext: { token: 'gf_test', accessMode: 'claude' },
      routeAccessMode: 'standard',
    },
    {
      authContext: { token: 'gf_test', accessMode: 'standard' },
      routeAccessMode: 'claude',
    },
    { routeAccessMode: 'claude' },
  ])('uses the stricter route/token policy for %j', async (request) => {
    await service.handlePost(
      {
        body: { method: 'tools/list' },
        toolsets: ['generation'],
        ...request,
      } as unknown as Request,
      makeRes(),
    );
    expect(toolRegistryConstructorCalls.at(-1)?.[5]).toBe('claude');
  });
});
