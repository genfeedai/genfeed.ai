import { LoggerModule } from '@libs/logger/logger.module';
import { ConfigModule } from '@mcp/config/config.module';
import { McpAuthGuard } from '@mcp/guards/mcp-auth.guard';
import { McpController } from '@mcp/mcp/controllers/mcp.controller';
import { MCPService } from '@mcp/mcp/services/mcp.service';
import { AuthService } from '@mcp/services/auth.service';
import { ClientService } from '@mcp/services/client.service';
import { ServerService } from '@mcp/services/server.service';
import { StreamableHttpService } from '@mcp/services/streamable-http.service';
import { ToolRegistryService } from '@mcp/services/tool-registry.service';
import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';

@Module({
  controllers: [McpController],
  imports: [ConfigModule, LoggerModule, HttpModule],
  providers: [
    AuthService,
    ClientService,
    MCPService,
    McpAuthGuard,
    ServerService,
    StreamableHttpService,
    ToolRegistryService,
    {
      provide: APP_GUARD,
      useClass: McpAuthGuard,
    },
  ],
})
export class McpGenfeedAiModule {}
