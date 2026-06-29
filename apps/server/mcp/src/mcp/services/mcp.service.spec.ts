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
      const serverConfig = config.mcpServers.genfeed;

      expect(config).toBeDefined();
      expect(config.mcpServers).toBeDefined();
      expect(serverConfig).toBeDefined();
      expect(serverConfig).toMatchObject({
        headers: {
          Authorization: 'Bearer ${GENFEED_API_KEY}',
        },
        transport: 'streamable-http',
        type: 'http',
        url: 'https://mcp.genfeed.ai/mcp',
      });
    });

    it('should include hosted Streamable HTTP auth details', () => {
      const config = service.getMcpConfiguration();
      const serverConfig = config.mcpServers.genfeed;

      expect(serverConfig).toMatchObject({
        headers: {
          Authorization: 'Bearer ${GENFEED_API_KEY}',
        },
        url: 'https://mcp.genfeed.ai/mcp',
      });
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
      expect(example.installation.clientExamples.claudeCode.command).toContain(
        'claude mcp add --transport http genfeed',
      );
      expect(example.installation.clientExamples.codex.command).toContain(
        'codex mcp add genfeed --url https://mcp.genfeed.ai/mcp',
      );
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
