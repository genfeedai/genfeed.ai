import { LoggerService } from '@libs/logger/logger.service';
import { ConfigService } from '@mcp/config/config.service';
import { StreamableHttpService } from '@mcp/services/streamable-http.service';
import { ToolRegistryService } from '@mcp/services/tool-registry.service';
import { HttpService } from '@nestjs/axios';
import { Test, TestingModule } from '@nestjs/testing';
import type { Request, Response } from 'express';

// Mock MCP SDK
const mockServerConnect = vi.fn().mockResolvedValue(undefined);
const mockServerClose = vi.fn().mockResolvedValue(undefined);
const mockServerSetRequestHandler = vi.fn();
const mockTransportHandleRequest = vi.fn().mockResolvedValue(undefined);
let mockSessionId = 'session-abc-123';

vi.mock('@modelcontextprotocol/sdk/server', () => ({
  Server: class MockServer {
    close = mockServerClose;
    connect = mockServerConnect;
    setRequestHandler = mockServerSetRequestHandler;
  },
}));

vi.mock('@modelcontextprotocol/sdk/server/streamableHttp.js', () => ({
  StreamableHTTPServerTransport: class MockStreamableHTTPServerTransport {
    handleRequest = mockTransportHandleRequest;
    onclose: (() => void) | null = null;

    get sessionId() {
      return mockSessionId;
    }
  },
}));

vi.mock('@modelcontextprotocol/sdk/types.js', () => ({
  CallToolRequestSchema: 'CallToolRequestSchema',
  ListResourcesRequestSchema: 'ListResourcesRequestSchema',
  ListToolsRequestSchema: 'ListToolsRequestSchema',
  ReadResourceRequestSchema: 'ReadResourceRequestSchema',
}));

vi.mock('@mcp/services/client.service', () => ({
  ClientService: class MockClientService {
    setBearerToken = vi.fn();
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
} {
  const res = {
    json: vi.fn(),
    status: vi.fn(),
  } as unknown as Response & {
    status: ReturnType<typeof vi.fn>;
    json: ReturnType<typeof vi.fn>;
  };
  (res.status as ReturnType<typeof vi.fn>).mockReturnValue(res);
  return res;
}

describe('StreamableHttpService', () => {
  let service: StreamableHttpService;
  let loggerService: {
    debug: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
    log: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
  };
  let toolRegistryService: {
    getResources: ReturnType<typeof vi.fn>;
    getTools: ReturnType<typeof vi.fn>;
    handleResourceRead: ReturnType<typeof vi.fn>;
    handleToolCall: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    mockSessionId = 'session-abc-123';

    loggerService = {
      debug: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    };
    toolRegistryService = {
      getResources: vi.fn().mockReturnValue([]),
      getTools: vi.fn().mockReturnValue([]),
      handleResourceRead: vi.fn(),
      handleToolCall: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StreamableHttpService,
        { provide: ToolRegistryService, useValue: toolRegistryService },
        { provide: LoggerService, useValue: loggerService },
        { provide: HttpService, useValue: { get: vi.fn(), post: vi.fn() } },
        {
          provide: ConfigService,
          useValue: {
            get: vi.fn((key: string) => {
              if (key === 'GENFEEDAI_API_KEY') {
                return '';
              }
              if (key === 'GENFEEDAI_API_URL') {
                return 'http://localhost:3000';
              }
              return undefined;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<StreamableHttpService>(StreamableHttpService);
  });

  afterEach(async () => {
    if (!service) {
      return;
    }

    clearInterval(
      (
        service as unknown as {
          cleanupInterval: ReturnType<typeof setInterval>;
        }
      ).cleanupInterval,
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('handlePost', () => {
    it('should create a new session when no session id in header', async () => {
      const req = makeReq({ headers: {} });
      const res = makeRes();

      await service.handlePost(req, res);

      expect(mockServerConnect).toHaveBeenCalledOnce();
      expect(mockTransportHandleRequest).toHaveBeenCalledWith(req, res);
    });

    it('should route to existing session when session id matches', async () => {
      const req = makeReq({ headers: {} });
      const res = makeRes();

      // Create a session first
      await service.handlePost(req, res);
      expect(service.getActiveSessionCount()).toBe(1);

      // Second request reuses existing session
      const req2 = makeReq({
        headers: { 'mcp-session-id': 'session-abc-123' },
      });
      await service.handlePost(req2, makeRes());

      expect(mockTransportHandleRequest).toHaveBeenCalledTimes(2);
      expect(service.getActiveSessionCount()).toBe(1);
    });

    it('should propagate bearer token from authContext when session exists', async () => {
      const req = makeReq({ headers: {} });
      await service.handlePost(req, makeRes());

      const req2 = makeReq({
        authContext: { token: 'bearer-xyz' },
        headers: { 'mcp-session-id': 'session-abc-123' },
      } as unknown as Partial<Request>);

      await service.handlePost(req2, makeRes());
      // Token was set on the client service — no error thrown
      expect(service.getActiveSessionCount()).toBe(1);
    });
  });

  describe('handleGet', () => {
    it('should return 400 when session id is missing', async () => {
      const req = makeReq({ headers: {} });
      const res = makeRes();

      await service.handleGet(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.any(String) }),
      );
    });

    it('should return 400 when session id does not match any session', async () => {
      const req = makeReq({
        headers: { 'mcp-session-id': 'unknown-session' },
      });
      const res = makeRes();

      await service.handleGet(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('should delegate to transport when session is found', async () => {
      // Create session first
      await service.handlePost(makeReq({ headers: {} }), makeRes());

      const req = makeReq({
        headers: { 'mcp-session-id': 'session-abc-123' },
      });
      const res = makeRes();

      await service.handleGet(req, res);

      expect(mockTransportHandleRequest).toHaveBeenCalledWith(req, res);
    });
  });

  describe('handleDelete', () => {
    it('should return 404 when session not found', async () => {
      const req = makeReq({
        headers: { 'mcp-session-id': 'ghost-session' },
      });
      const res = makeRes();

      await service.handleDelete(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('should destroy session and return 200 when found', async () => {
      // Create session
      await service.handlePost(makeReq({ headers: {} }), makeRes());
      expect(service.getActiveSessionCount()).toBe(1);

      const req = makeReq({
        headers: { 'mcp-session-id': 'session-abc-123' },
      });
      const res = makeRes();

      await service.handleDelete(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ status: 'session closed' });
      expect(service.getActiveSessionCount()).toBe(0);
    });
  });

  describe('getActiveSessionCount', () => {
    it('should return 0 initially', () => {
      expect(service.getActiveSessionCount()).toBe(0);
    });

    it('should increment as sessions are created', async () => {
      await service.handlePost(makeReq({ headers: {} }), makeRes());
      expect(service.getActiveSessionCount()).toBe(1);
    });

    it('should throw when transport generates no session id', async () => {
      mockSessionId = undefined as unknown as string;

      await expect(
        service.handlePost(makeReq({ headers: {} }), makeRes()),
      ).rejects.toThrow('Transport did not generate a session ID');
    });
  });
});
