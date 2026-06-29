import { getToolsForSurface, toMcpTools } from '@genfeedai/tools';
import { LoggerService } from '@libs/logger/logger.service';
import * as appMetadata from '@mcp/config/app-metadata.json';
import { Public } from '@mcp/guards/mcp-auth.guard';
import { MCPService } from '@mcp/mcp/services/mcp.service';
import { getPublicMcpUrl, renderSetupPage } from '@mcp/mcp/setup-page';
import { ClientService } from '@mcp/services/client.service';
import { ServerService } from '@mcp/services/server.service';
import { Body, Controller, Get, Param, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';

interface AuthenticatedRequest extends Request {
  authContext?: { token?: string };
}

@Controller()
export class McpController {
  constructor(
    private readonly mcpService: MCPService,
    private readonly clientService: ClientService,
    private readonly serverService: ServerService,
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
  getTools() {
    return {
      tools: toMcpTools(getToolsForSurface('mcp')),
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

  @Post('tools/:toolName')
  async callTool(
    @Param('toolName') toolName: string,
    @Body() args: Record<string, unknown> | null,
    @Req() request: AuthenticatedRequest,
  ) {
    this.logger.log(`Calling tool: ${toolName}`);

    if (request.authContext?.token) {
      this.clientService.setBearerToken(request.authContext.token);
    }

    const result = await this.simulateToolCall(toolName, args);

    return {
      result,
      timestamp: new Date().toISOString(),
      tool: toolName,
    };
  }

  private async simulateToolCall(
    toolName: string,
    args: Record<string, unknown> | null,
  ) {
    const isKnownTool = this.getTools().tools.some(
      (tool: { name: string }) => tool.name === toolName,
    );
    if (!isKnownTool) {
      throw new Error(`Unknown tool: ${toolName}`);
    }
    switch (toolName) {
      case 'generate_video': {
        if (!args) {
          throw new Error('Arguments required for generate_video');
        }
        const video = await this.clientService.createVideo({
          description: args.description as string,
          duration: args.duration as number | undefined,
          style: args.style as string | undefined,
          title: args.title as string,
          voiceOver: args.voiceOver as
            | { enabled: boolean; voice?: string }
            | undefined,
        });

        return {
          content: [
            {
              text: `Video creation initiated successfully!\nVideo ID: ${video.id}\nStatus: ${video.status}\nEstimated completion: ${video.estimatedCompletion}`,
              type: 'text',
            },
          ],
        };
      }

      case 'get_video_status': {
        if (!args || !args.videoId) {
          throw new Error('videoId required');
        }
        const status = await this.clientService.getVideoStatus(
          args.videoId as string,
        );
        return {
          content: [
            {
              text: `Video Status: ${status.status}\nProgress: ${status.progress}%\n${status.message || ''}`,
              type: 'text',
            },
          ],
        };
      }

      case 'list_videos': {
        const limit = (args?.limit as number) || 10;
        const offset = (args?.offset as number) || 0;
        const videos = await this.clientService.listVideos(limit, offset);
        return {
          content: [
            {
              text: JSON.stringify(videos, null, 2),
              type: 'text',
            },
          ],
        };
      }

      case 'get_video_analytics': {
        if (!args || !args.videoId) {
          throw new Error('videoId required');
        }
        const videoId = args.videoId as string;
        const timeRange = (args.timeRange as string) || '7d';
        const analytics = await this.clientService.getVideoAnalytics(
          videoId,
          timeRange,
        );
        return {
          content: [
            {
              text: JSON.stringify(analytics, null, 2),
              type: 'text',
            },
          ],
        };
      }

      default:
        throw new Error(`Unknown tool: ${toolName}`);
    }
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
