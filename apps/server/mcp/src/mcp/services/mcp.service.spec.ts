import { getToolsForRole } from '@genfeedai/actions';
import * as appMetadata from '@mcp/config/app-metadata.json';
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

  beforeEach(() => {
    vi.stubEnv('GENFEEDAI_MCP_PUBLIC_URL', '');
    vi.stubEnv('GENFEEDAI_MICROSERVICES_MCP_URL', '');
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
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
          Authorization: `Bearer \${GENFEED_API_KEY}`,
        },
        transport: 'streamable-http',
        type: 'http',
        url: 'https://mcp.genfeed.ai/mcp',
      });
    });
  });

  describe('getMcpExample', () => {
    it('should return MCP example configuration', () => {
      const example = service.getMcpExample();

      expect(example).toBeDefined();
      expect(example.name).toBe('Genfeed.ai MCP Server');
      expect(example.installation.clientExamples.claudeCode.command).toContain(
        'claude mcp add --transport http genfeed',
      );
      expect(example.installation.clientExamples.codex.command).toContain(
        'codex mcp add genfeed --url https://mcp.genfeed.ai/mcp',
      );
    });

    it('takes its description and version from the app manifest', () => {
      const example = service.getMcpExample();

      expect(example.description).toBe(appMetadata.description);
      expect(example.version).toBe(appMetadata.version);
      // The endpoint serves the whole platform, not a video-only server.
      expect(example.description).not.toContain('video generation and');
    });

    it('reports the real MCP tool count instead of a hardcoded sample', () => {
      const example = service.getMcpExample();

      expect(example.tools.total).toBe(getToolsForRole('mcp', 'user').length);
      expect(example.tools.total).toBeGreaterThan(example.tools.preview.length);
      expect(example.tools.endpoint).toBe('https://mcp.genfeed.ai/v1/tools');
    });

    it('is deterministic and spreads the preview across categories', () => {
      const { preview } = service.getMcpExample().tools;
      const categories = preview.map((tool) => tool.category);

      expect(preview).toEqual(service.getMcpExample().tools.preview);
      expect(new Set(categories).size).toBe(categories.length);
      expect(preview.length).toBeLessThanOrEqual(8);
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
