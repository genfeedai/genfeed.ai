import { Public } from '@libs/decorators/public.decorator';
import { LoggerService } from '@libs/logger/logger.service';
import * as appMetadata from '@mcp/config/app-metadata.json';
import { MCPService } from '@mcp/mcp/services/mcp.service';
import { getPublicMcpUrl, renderSetupPage } from '@mcp/mcp/setup-page';
import { type McpRole } from '@mcp/services/auth.service';
import { ClientService } from '@mcp/services/client.service';
import { ServerService } from '@mcp/services/server.service';
import { ToolRegistryService } from '@mcp/services/tool-registry.service';
import { Controller, Get, Param, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';

interface AuthenticatedRequest extends Request {
  authContext?: { token?: string; role?: McpRole };
}

@Controller()
export class McpController {
  constructor(
    private readonly mcpService: MCPService,
    private readonly clientService: ClientService,
    private readonly serverService: ServerService,
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
        protocol: 'MCP 2025-03-26',
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
      protocol: 'MCP 2025-03-26',
      serverRunning: this.serverService.isServerRunning(),
      transport: 'streamable-http',
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
      mcp_version: '1.18.1',
      server_running: this.serverService.isServerRunning(),
      server_version: '1.0.0',
      status: 'active',
      timestamp: new Date().toISOString(),
    };
  }

  @Public()
  @Get('health')
  getHealth() {
    return {
      endpoints: {
        config: '/config',
        docs: '/',
        example: '/example',
        health: '/health',
        manifest: '/manifest',
        mcpInfo: '/mcp-info',
        streamableHttp: '/mcp',
      },
      message: this.mcpService.getHello(),
      serverRunning: this.serverService.isServerRunning(),
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
    };
  }

  @Get('tools')
  getTools(@Req() request: AuthenticatedRequest) {
    const role: McpRole = request?.authContext?.role ?? 'user';
    return {
      tools: this.toolRegistry.getToolsForRole(role),
    };
  }

  @Get('resources')
  getResources() {
    return {
      resources: [
        {
          description: 'Get analytics for all videos in your organization',
          mimeType: 'application/json',
          name: 'Video Analytics',
          uri: 'genfeed://analytics/videos',
        },
        {
          description: 'Get overall organization analytics',
          mimeType: 'application/json',
          name: 'Organization Analytics',
          uri: 'genfeed://analytics/organization',
        },
      ],
    };
  }

  private async simulateResourceRead(resourceUri: string) {
    switch (resourceUri) {
      case 'genfeed://analytics/videos': {
        const videoAnalytics = await this.clientService.getVideoAnalytics();
        return {
          contents: [
            {
              mimeType: 'application/json',
              text: JSON.stringify(videoAnalytics, null, 2),
              uri: 'genfeed://analytics/videos',
            },
          ],
        };
      }

      case 'genfeed://analytics/organization': {
        const orgAnalytics =
          await this.clientService.getOrganizationAnalytics();
        return {
          contents: [
            {
              mimeType: 'application/json',
              text: JSON.stringify(orgAnalytics, null, 2),
              uri: 'genfeed://analytics/organization',
            },
          ],
        };
      }

      default:
        throw new Error(`Unknown resource: ${resourceUri}`);
    }
  }

  @Get('resources/:resourceUri')
  async readResource(
    @Param('resourceUri') resourceUri: string,
    @Req() request: AuthenticatedRequest,
  ) {
    this.logger.log(`Reading resource: ${resourceUri}`);

    if (request.authContext?.token) {
      this.clientService.setBearerToken(request.authContext.token);
    }

    const result = await this.simulateResourceRead(resourceUri);

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
