import type { McpRole } from '@genfeedai/mcp-kit';
import { Public } from '@libs/decorators/public.decorator';
import { LoggerService } from '@libs/logger/logger.service';
import * as appMetadata from '@mcp/config/app-metadata.json';
import { MCP_RESOURCES } from '@mcp/mcp/resource-catalog';
import { MCPService } from '@mcp/mcp/services/mcp.service';
import { getPublicMcpUrl, renderSetupPage } from '@mcp/mcp/setup-page';
import { StreamableHttpService } from '@mcp/services/streamable-http.service';
import { ToolRegistryService } from '@mcp/services/tool-registry.service';
import type { McpRequest } from '@mcp/shared/interfaces/mcp-request.interface';
import { filterBrandKitTools } from '@mcp/tools/brand-kit.tool';
import { Controller, Get, Param, Req, Res } from '@nestjs/common';
import type { Response } from 'express';

@Controller()
export class McpController {
  constructor(
    private readonly mcpService: MCPService,
    private readonly streamableHttpService: StreamableHttpService,
    private readonly toolRegistry: ToolRegistryService,
    private readonly logger: LoggerService,
  ) {}

  @Public()
  @Get()
  getHomePage(@Res() res: Response) {
    res.redirect('/v1/docs');
  }

  @Public()
  @Get('config')
  getMcpConfiguration() {
    const config = this.mcpService.getMcpConfiguration();
    const endpoint = getPublicMcpUrl();
    return {
      ...config,
      streamableHttp: {
        auth: 'Bearer token (API key starting with gf_)',
        endpoint,
        methods: ['POST', 'GET', 'DELETE'],
        protocol: 'MCP 2026-07-28',
        legacyProtocols: ['2025-11-25', '2025-06-18', '2025-03-26'],
        transport: 'streamable-http',
      },
    };
  }

  @Public()
  @Get('mcp-info')
  getMcpInfo() {
    const endpoint = getPublicMcpUrl();

    return {
      auth: 'Bearer token (API key starting with gf_)',
      endpoint,
      methods: ['POST', 'GET', 'DELETE'],
      protocol: 'MCP 2026-07-28',
      legacyProtocols: ['2025-11-25', '2025-06-18', '2025-03-26'],
      transport: 'streamable-http',
      // Readiness of the transport that actually serves MCP traffic — the
      // Streamable HTTP routes mounted in `main.ts`.
      transportReady: this.streamableHttpService.isTransportReady(),
    };
  }

  @Public()
  @Get('example')
  getMcpExample() {
    return this.mcpService.getMcpExample();
  }

  @Public()
  @Get('manifest')
  getManifest() {
    return {
      ...appMetadata,
      mcp: {
        ...appMetadata.mcp,
        server: {
          ...appMetadata.mcp.server,
          url: getPublicMcpUrl(),
        },
      },
      mcp_version: '2026-07-28',
      server_version: '1.0.0',
      status: 'active',
      timestamp: new Date().toISOString(),
      transport_ready: this.streamableHttpService.isTransportReady(),
    };
  }

  @Get('tools')
  getTools(@Req() request: McpRequest) {
    const role: McpRole = request?.authContext?.role ?? 'user';

    return {
      tools: filterBrandKitTools(
        this.toolRegistry.getToolsForRole(
          role,
          request.authContext?.accessMode ?? 'standard',
        ),
        request.authContext?.hasBrandKitEditAccess,
      ),
    };
  }

  @Get('resources')
  getResources() {
    return {
      resources: [...MCP_RESOURCES],
    };
  }

  /**
   * REST mirror of `resources/read`. It delegates to the same registry the
   * JSON-RPC transport uses instead of re-implementing the readers, so the two
   * surfaces cannot answer differently for the same URI. The registry is built
   * per request: the injected singleton holds one shared API client, so
   * writing a caller's token onto it let concurrent readers use each other's
   * identity.
   */
  @Get('resources/:resourceUri')
  async readResource(
    @Param('resourceUri') resourceUri: string,
    @Req() request: McpRequest,
  ) {
    this.logger.log(`Reading resource: ${resourceUri}`);

    const toolRegistry = this.streamableHttpService.createToolRegistry(
      request.authContext,
      request.routeAccessMode,
    );
    const result = await toolRegistry.handleResourceRead({
      uri: resourceUri,
    });

    return {
      resource: resourceUri,
      result,
      timestamp: new Date().toISOString(),
    };
  }

  @Public()
  @Get('docs')
  getMcpDocumentation(@Res() res: Response) {
    res.setHeader('Content-Type', 'text/html');
    res.send(renderSetupPage());
  }
}
