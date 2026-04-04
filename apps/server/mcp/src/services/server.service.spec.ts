import { LoggerService } from '@libs/logger/logger.service';
import { ServerService } from '@mcp/services/server.service';
import { ToolRegistryService } from '@mcp/services/tool-registry.service';

const mockServerInstance = {
  close: vi.fn().mockResolvedValue(undefined),
  connect: vi.fn().mockResolvedValue(undefined),
  setRequestHandler: vi.fn(),
};

vi.mock('@modelcontextprotocol/sdk/server', () => ({
  Server: vi.fn(function MockServer() {
    return mockServerInstance;
  }),
}));

vi.mock('@modelcontextprotocol/sdk/server/stdio.js', () => ({
  StdioServerTransport: vi.fn(function MockStdioServerTransport() {
    return { transport: 'stdio' };
  }),
}));

describe('ServerService', () => {
  let service: ServerService;

  const mockToolRegistryService: Pick<
    ToolRegistryService,
    | 'getResources'
    | 'getTools'
    | 'handleResourceRead'
    | 'handleToolCall'
    | 'setBearerToken'
  > = {
    getResources: vi.fn().mockReturnValue([]),
    getTools: vi.fn().mockReturnValue([]),
    handleResourceRead: vi.fn().mockResolvedValue({ contents: [] }),
    handleToolCall: vi.fn().mockResolvedValue({ content: [] }),
    setBearerToken: vi.fn(),
  };

  const mockLoggerService: Pick<
    LoggerService,
    'debug' | 'error' | 'log' | 'warn'
  > = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();

    service = new ServerService(
      mockToolRegistryService as ToolRegistryService,
      mockLoggerService as LoggerService,
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should initialize server on module init', async () => {
    await service.onModuleInit();

    expect(mockServerInstance.setRequestHandler).toHaveBeenCalledTimes(4);
    expect(mockServerInstance.connect).toHaveBeenCalledTimes(1);
    expect(mockLoggerService.log).toHaveBeenCalledWith(
      'MCP Server initialized and running',
    );
    expect(service.isServerRunning()).toBe(true);
  });

  it('should stop server on module destroy when running', async () => {
    await service.onModuleInit();
    await service.onModuleDestroy();

    expect(mockServerInstance.close).toHaveBeenCalledTimes(1);
    expect(mockLoggerService.log).toHaveBeenCalledWith('MCP Server stopped');
    expect(service.isServerRunning()).toBe(false);
  });

  it('should delegate bearer token to tool registry', () => {
    service.setBearerToken('token-123');

    expect(mockToolRegistryService.setBearerToken).toHaveBeenCalledWith(
      'token-123',
    );
  });
});
