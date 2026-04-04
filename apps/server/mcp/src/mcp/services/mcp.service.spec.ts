import { MCPService } from '@mcp/mcp/services/mcp.service';
import { Test, TestingModule } from '@nestjs/testing';

describe('MCPService', () => {
  let service: MCPService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [MCPService],
    }).compile();

    service = module.get<MCPService>(MCPService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getHello', () => {
    it('should return welcome message', () => {
      const result = service.getHello();
      expect(result).toBe(
        'Genfeed.ai MCP Server - Ready to serve AI-powered video generation!',
      );
    });
  });

  describe('getMcpConfiguration', () => {
    it('should return MCP configuration', () => {
      const config = service.getMcpConfiguration();

      expect(config).toBeDefined();
      expect(config.mcpServers).toBeDefined();
      expect(config.mcpServers['genfeed-ai']).toBeDefined();
      expect(config.mcpServers['genfeed-ai'].command).toBe('node');
      expect(config.mcpServers['genfeed-ai'].args).toEqual([
        'dist/mcp/main.js',
      ]);
      expect(config.mcpServers['genfeed-ai'].env).toBeDefined();
    });

    it('should include required environment variables', () => {
      const config = service.getMcpConfiguration();
      const env = config.mcpServers['genfeed-ai'].env;

      expect(env?.NODE_ENV).toBe('production');
      expect(env?.MCP_PORT).toBe('3003');
      expect(env?.GENFEEDAI_API_URL).toBe('https://api.genfeed.ai');
      expect(env?.GENFEED_API_KEY).toBeDefined();
    });
  });

  describe('getMcpExample', () => {
    it('should return MCP example configuration', () => {
      const example = service.getMcpExample();

      expect(example).toBeDefined();
      expect(example.name).toBe('Genfeed.ai MCP Server');
      expect(example.version).toBe('1.0.0');
      expect(example.description).toContain('AI-powered video generation');
      expect(example.capabilities).toBeDefined();
      expect(example.tools).toBeDefined();
    });

    it('should include capabilities configuration', () => {
      const example = service.getMcpExample();

      expect(example.capabilities.tools).toBeDefined();
      expect(example.capabilities.tools.listChanged).toBe(true);
      expect(example.capabilities.resources).toBeDefined();
      expect(example.capabilities.resources.listChanged).toBe(true);
    });
  });
});
