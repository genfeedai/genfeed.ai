import { getToolsForSurface, toMcpTools } from '@genfeedai/tools';
import { LoggerService } from '@libs/logger/logger.service';
import * as appMetadata from '@mcp/config/app-metadata.json';
import { Public } from '@mcp/guards/mcp-auth.guard';
import { MCPService } from '@mcp/mcp/services/mcp.service';
import { ClientService } from '@mcp/services/client.service';
import { ServerService } from '@mcp/services/server.service';
import { StreamableHttpService } from '@mcp/services/streamable-http.service';
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
    private readonly streamableHttpService: StreamableHttpService,
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
    return {
      ...config,
      streamableHttp: {
        auth: 'Bearer token (API key starting with gf_)',
        endpoint: 'https://mcp.genfeed.ai/mcp',
        methods: ['POST', 'GET', 'DELETE'],
        protocol: 'MCP 2025-03-26',
        transport: 'streamable-http',
      },
    };
  }

  @Public()
  @Get('mcp-info')
  getMcpInfo() {
    return {
      auth: 'Bearer token (API key starting with gf_)',
      endpoint: 'https://mcp.genfeed.ai/mcp',
      methods: ['POST', 'GET', 'DELETE'],
      protocol: 'MCP 2025-03-26',
      serverRunning: this.serverService.isServerRunning(),
      sessions: this.streamableHttpService.getActiveSessionCount(),
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
      sessions: this.streamableHttpService.getActiveSessionCount(),
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
    const html = this.getHomePageHtml();
    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  }

  private getHomePageHtml(): string {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Genfeed MCP Server</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
            line-height: 1.6;
            color: #333;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            justify-content: center;
            align-items: center;
            padding: 20px;
        }
        .container {
            max-width: 900px;
            background: white;
            border-radius: 20px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
            overflow: hidden;
        }
        .header {
            background: linear-gradient(135deg, #764ba2 0%, #667eea 100%);
            color: white;
            padding: 40px;
            text-align: center;
        }
        .header h1 {
            font-size: 2.5em;
            margin-bottom: 10px;
        }
        .header p {
            font-size: 1.2em;
            opacity: 0.9;
        }
        .content {
            padding: 40px;
        }
        .section {
            margin-bottom: 40px;
        }
        .section h2 {
            color: #667eea;
            margin-bottom: 20px;
            font-size: 1.8em;
        }
        .code-block {
            background: #f4f4f4;
            border: 1px solid #ddd;
            border-radius: 8px;
            padding: 20px;
            margin: 15px 0;
            font-family: 'Courier New', monospace;
            overflow-x: auto;
        }
        .endpoint {
            background: #e8f4fd;
            border-left: 4px solid #667eea;
            padding: 15px;
            margin: 15px 0;
            border-radius: 4px;
        }
        .endpoint strong {
            color: #667eea;
        }
        .tools-list, .resources-list {
            list-style: none;
            padding: 0;
        }
        .tools-list li, .resources-list li {
            background: #f8f9fa;
            padding: 15px;
            margin: 10px 0;
            border-radius: 8px;
            border-left: 4px solid #667eea;
        }
        .tools-list li strong, .resources-list li strong {
            color: #667eea;
            display: block;
            margin-bottom: 5px;
        }
        .status {
            display: inline-block;
            padding: 5px 15px;
            background: #4caf50;
            color: white;
            border-radius: 20px;
            font-weight: bold;
            margin-top: 10px;
        }
        .warning {
            background: #fff3cd;
            border: 1px solid #ffc107;
            border-radius: 8px;
            padding: 15px;
            margin: 20px 0;
            color: #856404;
        }
        .footer {
            text-align: center;
            padding: 20px;
            background: #f8f9fa;
            color: #666;
        }
        .config-section {
            background: #f0f9ff;
            border: 1px solid #0ea5e9;
            border-radius: 8px;
            padding: 20px;
            margin: 20px 0;
        }
        .config-section h3 {
            color: #0ea5e9;
            margin-bottom: 15px;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🎬 Genfeed MCP Server</h1>
            <p>Model Context Protocol for AI Video Generation & Analytics</p>
            <div class="status">Active</div>
        </div>

        <div class="content">
            <div class="section">
                <h2>🔌 Connection Details</h2>
                <div class="endpoint">
                    <strong>Server Endpoint:</strong> http://localhost:3014
                </div>
                <div class="endpoint">
                    <strong>Health Check:</strong> GET http://localhost:3014/v1/health
                </div>
                <div class="endpoint">
                    <strong>Configuration:</strong> GET http://localhost:3014/config
                </div>
                <div class="endpoint">
                    <strong>Example:</strong> GET http://localhost:3014/example
                </div>
            </div>

            <div class="section">
                <h2>🔐 Authentication</h2>
                <p>This MCP server requires a Genfeed.ai API key for authentication:</p>
                <div class="code-block">
GENFEED_API_KEY=your-api-key-here
GENFEEDAI_API_URL=https://api.genfeed.ai
                </div>
                <p>Set these environment variables when running the server or configure them in your Claude Desktop settings.</p>
            </div>

            <div class="section">
                <h2>🤖 Connect from Claude Desktop</h2>
                <p>Add this server to your Claude Desktop configuration:</p>

                <div class="config-section">
                    <h3>Claude Desktop Configuration</h3>
                    <p><strong>Config file location:</strong></p>
                    <ul style="margin-left: 20px; margin-top: 10px;">
                        <li><strong>macOS:</strong> ~/Library/Application Support/Claude/claude_desktop_config.json</li>
                        <li><strong>Windows:</strong> %APPDATA%\\Claude\\claude_desktop_config.json</li>
                        <li><strong>Linux:</strong> ~/.config/claude-desktop/config.json</li>
                    </ul>

                    <p style="margin-top: 15px;"><strong>Add this configuration:</strong></p>
                    <div class="code-block">{
  "mcpServers": {
    "genfeed-ai": {
      "command": "node",
      "args": ["/path/to/genfeed/dist/mcp/main.js"],
      "env": {
        "NODE_ENV": "production",
        "MCP_PORT": "3014",
        "GENFEEDAI_API_URL": "https://api.genfeed.ai",
        "GENFEED_API_KEY": "your-api-key-here"
      }
    }
  }
}</div>
                </div>

                <ol style="margin-left: 20px; margin-top: 15px;">
                    <li style="margin: 10px 0;">Install and build the Genfeed.ai MCP server</li>
                    <li style="margin: 10px 0;">Add the configuration above to your Claude Desktop config file</li>
                    <li style="margin: 10px 0;">Replace the path and API key with your actual values</li>
                    <li style="margin: 10px 0;">Restart Claude Desktop and start using the tools!</li>
                </ol>
            </div>

            <div class="section">
                <h2>🌐 Connect via Streamable HTTP (Remote Agents)</h2>
                <p>For remote AI agents (OpenClaw, custom agents), connect via the Streamable HTTP transport:</p>

                <div class="config-section">
                    <h3>Streamable HTTP Endpoint</h3>
                    <div class="endpoint">
                        <strong>Endpoint:</strong> https://mcp.genfeed.ai/mcp
                    </div>
                    <div class="endpoint">
                        <strong>Protocol:</strong> MCP 2025-03-26 (Streamable HTTP)
                    </div>
                    <div class="endpoint">
                        <strong>Methods:</strong> POST, GET, DELETE
                    </div>
                    <div class="endpoint">
                        <strong>Auth:</strong> Bearer token (API key starting with gf_)
                    </div>
                </div>

                <p style="margin-top: 15px;"><strong>Connect from any MCP client:</strong></p>
                <div class="code-block">import { Client } from "@modelcontextprotocol/sdk/client";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const transport = new StreamableHTTPClientTransport(
  new URL("https://mcp.genfeed.ai/mcp"),
  { requestInit: { headers: { Authorization: "Bearer gf_live_xxx" } } }
);

const client = new Client({ name: "my-agent", version: "1.0.0" });
await client.connect(transport);

const tools = await client.listTools();
const result = await client.callTool({
  name: "generate_image",
  arguments: { prompt: "A sunset over mountains" }
});</div>

                <p style="margin-top: 15px;"><strong>OpenClaw / Agent Configuration:</strong></p>
                <div class="code-block">{
  "mcpServers": {
    "genfeed": {
      "url": "https://mcp.genfeed.ai/mcp",
      "headers": {
        "Authorization": "Bearer gf_live_xxx"
      }
    }
  }
}</div>
            </div>

            <div class="section">
                <h2>🛠️ Available Tools</h2>
                <ul class="tools-list">
                    <li>
                        <strong>generate_video</strong>
                        Create AI-generated videos with customizable styles, duration, and voice-over options. Supports professional, casual, animated, documentary, and tutorial styles.
                    </li>
                    <li>
                        <strong>get_video_status</strong>
                        Check the processing status and progress of your video creation jobs. Returns real-time updates on video generation progress.
                    </li>
                    <li>
                        <strong>list_videos</strong>
                        Get a paginated list of all videos in your organization with optional limit and offset parameters.
                    </li>
                    <li>
                        <strong>get_video_analytics</strong>
                        Retrieve detailed analytics for specific videos including views, engagement metrics, and performance data across different time ranges.
                    </li>
                </ul>
            </div>

            <div class="section">
                <h2>📊 Available Resources</h2>
                <ul class="resources-list">
                    <li>
                        <strong>genfeed://analytics/videos</strong>
                        Comprehensive analytics data for all videos in your organization, accessible directly through MCP resources.
                    </li>
                    <li>
                        <strong>genfeed://analytics/organization</strong>
                        Organization-wide performance metrics, statistics, and aggregated analytics data.
                    </li>
                </ul>
            </div>

            <div class="section">
                <h2>💻 Example Usage</h2>
                <p>Once connected to Claude Desktop, you can use natural language to interact with Genfeed.ai:</p>
                <div class="code-block">
# Create a professional video
"Create a professional video about AI trends with a 30-second duration and female voice-over"

# Check video status
"Check the status of video ID abc123"

# List recent videos
"Show me my last 5 videos"

# Get analytics
"Get analytics for video ID abc123 for the last 7 days"

# Access organization analytics
"Show me our organization's video performance metrics"
                </div>
            </div>

            <div class="section">
                <h2>🚀 Installation Steps</h2>
                <ol style="margin-left: 20px;">
                    <li style="margin: 10px 0;"><strong>Clone Repository:</strong> git clone https://github.com/genfeedai/api.genfeed.ai.git</li>
                    <li style="margin: 10px 0;"><strong>Install Dependencies:</strong> npm install</li>
                    <li style="margin: 10px 0;"><strong>Build Project:</strong> npm run build</li>
                    <li style="margin: 10px 0;"><strong>Set Environment Variables:</strong> Configure GENFEED_API_KEY and other required env vars</li>
                    <li style="margin: 10px 0;"><strong>Configure Claude Desktop:</strong> Add the MCP server configuration</li>
                    <li style="margin: 10px 0;"><strong>Restart Claude Desktop:</strong> The server will be available in your AI assistant</li>
                </ol>
            </div>

            <div class="warning">
                <strong>⚠️ Important:</strong> This server requires a valid Genfeed.ai API key. Make sure to set the GENFEED_API_KEY environment variable or configure it in your Claude Desktop settings.
            </div>
        </div>

        <div class="footer">
            <p>Genfeed MCP Server v1.0.0 | Powered by Model Context Protocol</p>
            <p><a href="https://genfeed.ai" style="color: #667eea;">genfeed.ai</a> | <a href="https://docs.genfeed.ai/api" style="color: #667eea;">API Documentation</a></p>
        </div>
    </div>
</body>
</html>
    `;
  }
}
