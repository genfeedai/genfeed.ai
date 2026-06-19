import { LoggerService } from '@libs/logger/logger.service';
import { ConfigService } from '@mcp/config/config.service';
import { StreamableHttpService } from '@mcp/services/streamable-http.service';
import { HttpService } from '@nestjs/axios';
import { Test, TestingModule } from '@nestjs/testing';
import type { Request, Response } from 'express';

// Hoisted trackers so the (hoisted) vi.mock factories can record every Server /
// transport constructed — this is how we assert per-request creation and
// teardown in the stateless transport. handleRequest is shared so the error
// path can be driven with mockRejectedValueOnce.
const { serverInstances, transportInstances, mockHandleRequest } = vi.hoisted(
  () => ({
    serverInstances: [] as Array<{
      connect: ReturnType<typeof vi.fn>;
      close: ReturnType<typeof vi.fn>;
      setRequestHandler: ReturnType<typeof vi.fn>;
    }>,
    transportInstances: [] as Array<{
      handleRequest: ReturnType<typeof vi.fn>;
      close: ReturnType<typeof vi.fn>;
      options: unknown;
    }>,
    mockHandleRequest: vi.fn(),
  }),
);

vi.mock('@modelcontextprotocol/sdk/server', () => ({
  Server: class MockServer {
    connect = vi.fn().mockResolvedValue(undefined);
    close = vi.fn().mockResolvedValue(undefined);
    setRequestHandler = vi.fn();
    constructor() {
      serverInstances.push(this);
    }
  },
}));

vi.mock('@modelcontextprotocol/sdk/server/streamableHttp.js', () => ({
  StreamableHTTPServerTransport: class MockStreamableHTTPServerTransport {
    handleRequest = mockHandleRequest;
    close = vi.fn().mockResolvedValue(undefined);
    options: unknown;
    constructor(options: unknown) {
      this.options = options;
      transportInstances.push(this);
    }
  },
}));

vi.mock('@modelcontextprotocol/sdk/types.js', () => ({
  CallToolRequestSchema: 'CallToolRequestSchema',
  ListResourcesRequestSchema: 'ListResourcesRequestSchema',
  ListToolsRequestSchema: 'ListToolsRequestSchema',
  ReadResourceRequestSchema: 'ReadResourceRequestSchema',
}));

const mockSetBearerToken = vi.fn();
vi.mock('@mcp/services/client.service', () => ({
  ClientService: class MockClientService {
    setBearerToken = mockSetBearerToken;
  },
}));

vi.mock('@mcp/services/tool-registry.service', () => ({
  ToolRegistryService: class MockToolRegistryService {
    getResources = vi.fn().mockReturnValue([]);
    getTools = vi.fn().mockReturnValue([]);
    handleResourceRead = vi.fn();
    handleToolCall = vi.fn();
  },
}));

function makeReq(overrides: Partial<Request> = {}): Request {
  return {
    headers: {},
    ...overrides,
  } as unknown as Request;
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
    transportInstances.length = 0;
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
      ],
    }).compile();

    service = module.get<StreamableHttpService>(StreamableHttpService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('handlePost', () => {
    it('builds a fresh stateless server + transport per request and handles it', async () => {
      const req = makeReq({ headers: {} });
      const res = makeRes();

      await service.handlePost(req, res);

      expect(serverInstances).toHaveLength(1);
      expect(transportInstances).toHaveLength(1);
      // Stateless mode: no session id generator configured.
      expect(transportInstances[0].options).toMatchObject({
        sessionIdGenerator: undefined,
      });
      expect(serverInstances[0].connect).toHaveBeenCalledOnce();
      expect(mockHandleRequest).toHaveBeenCalledWith(req, res, undefined);
    });

    it('tears down the transport and server after every request (finally)', async () => {
      await service.handlePost(makeReq({ headers: {} }), makeRes());

      expect(transportInstances[0].close).toHaveBeenCalledOnce();
      expect(serverInstances[0].close).toHaveBeenCalledOnce();
    });

    it('creates an independent transport per request (no reuse)', async () => {
      await service.handlePost(makeReq({ headers: {} }), makeRes());
      await service.handlePost(makeReq({ headers: {} }), makeRes());

      expect(transportInstances).toHaveLength(2);
      expect(serverInstances).toHaveLength(2);
      expect(transportInstances[0]).not.toBe(transportInstances[1]);
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

    it('responds 500 and still tears down when handleRequest throws', async () => {
      mockHandleRequest.mockRejectedValueOnce(new Error('boom'));
      const res = makeRes();

      await service.handlePost(makeReq({ headers: {} }), res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(transportInstances[0].close).toHaveBeenCalledOnce();
      expect(serverInstances[0].close).toHaveBeenCalledOnce();
    });
  });

  describe('handleGet / handleDelete', () => {
    it('routes GET through the same stateless per-request handler', async () => {
      const req = makeReq({ headers: {} });
      const res = makeRes();

      await service.handleGet(req, res);

      expect(transportInstances).toHaveLength(1);
      expect(mockHandleRequest).toHaveBeenCalledWith(req, res, undefined);
      expect(transportInstances[0].close).toHaveBeenCalledOnce();
    });

    it('routes DELETE through the same stateless per-request handler', async () => {
      const req = makeReq({ headers: {} });
      const res = makeRes();

      await service.handleDelete(req, res);

      expect(transportInstances).toHaveLength(1);
      expect(mockHandleRequest).toHaveBeenCalledWith(req, res, undefined);
      expect(serverInstances[0].close).toHaveBeenCalledOnce();
    });
  });
});
