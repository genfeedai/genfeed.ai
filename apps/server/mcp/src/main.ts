import {
  bootstrap,
  setupGracefulShutdown,
  setupServiceShell,
} from '@libs/bootstrap';
import '@mcp/instrument';

bootstrap({ app: 'mcp' });

import process from 'node:process';
import { McpResourceConfigurationError } from '@genfeedai/helpers/integrations/mcp-resource.helper';
import {
  getGenfeedCorsOptions,
  shouldAllowLocalCorsOrigins,
} from '@libs/config/cors.config';
import { LoggerService } from '@libs/logger/logger.service';
import { AppModule } from '@mcp/app.module';
import { ConfigService } from '@mcp/config/config.service';
import { resolveClientLogo } from '@mcp/mcp/client-logos';
import {
  getPublicMcpUrl,
  renderSetupPage,
  resolvePublicMcpResource,
  resolveSetupPageTab,
} from '@mcp/mcp/setup-page';
import { registerWellKnownRoutes } from '@mcp/mcp/well-known-routes';
import { AuthService } from '@mcp/services/auth.service';
import { RateLimitService } from '@mcp/services/rate-limit.service';
import { StreamableHttpService } from '@mcp/services/streamable-http.service';
import { mcpAccessModeMiddleware } from '@mcp/shared/middleware/mcp-access-mode.middleware';
import { createMcpAuthMiddleware } from '@mcp/shared/middleware/mcp-auth.middleware';
import { toolsetsQueryMiddleware } from '@mcp/shared/middleware/toolsets-query.middleware';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { NextFunction, Request, Response } from 'express';
import express from 'express';

const MCP_CORS_ALLOWED_HEADERS = [
  'Authorization',
  'Content-Type',
  'Last-Event-ID',
  'Mcp-Protocol-Version',
  'Mcp-Method',
  'Mcp-Name',
  'Mcp-Session-Id',
].join(', ');

const MCP_CORS_EXPOSED_HEADERS = [
  'Mcp-Protocol-Version',
  'Mcp-Session-Id',
  'Retry-After',
  'RateLimit-Limit',
  'RateLimit-Remaining',
  'RateLimit-Reset',
  'WWW-Authenticate',
  'X-RateLimit-Limit',
  'X-RateLimit-Remaining',
  'X-RateLimit-Reset',
].join(', ');

async function main(): Promise<void> {
  // Resolved once, before anything listens: a configured MCP URL the shared
  // rule rejects throws `McpResourceConfigurationError` naming the variable,
  // so the deployment fails here instead of at a user's token exchange with
  // an opaque `invalid_target` (#4553 defect 1).
  const mcpResource = resolvePublicMcpResource();

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    abortOnError: false,
    logger: ['error'],
    snapshot: true,
  });

  const configService = app.get(ConfigService);
  const logger = app.get(LoggerService);
  const authService = app.get(AuthService);
  const rateLimitService = app.get(RateLimitService);
  const streamableHttpService = app.get(StreamableHttpService);

  const port = configService.get('PORT');

  setupServiceShell(app);

  app.enableCors({
    ...getGenfeedCorsOptions({
      additionalOrigins: ['https://mcp.genfeed.ai'],
      chromeExtensionId: configService.get('CHROME_EXTENSION_ID'),
      isDevelopment: shouldAllowLocalCorsOrigins(configService.get('NODE_ENV')),
    }),
    allowedHeaders: MCP_CORS_ALLOWED_HEADERS,
    exposedHeaders: MCP_CORS_EXPOSED_HEADERS,
  });

  const expressApp = app.getHttpAdapter().getInstance();

  const mcpAuthMiddleware = createMcpAuthMiddleware({
    authService,
    rateLimitService,
  });

  registerWellKnownRoutes(expressApp);

  // `toolsetsQueryMiddleware` runs BEFORE authentication so an unknown
  // `?toolsets=` or `?profile=` name is rejected the same way for an
  // authenticated caller and an unauthenticated public discovery request
  // (`tools/list`). A bare URL resolves to the default profile.
  expressApp.post(
    ['/mcp', '/mcp/claude'],
    express.json({ limit: '1mb' }),
    mcpAccessModeMiddleware,
    toolsetsQueryMiddleware,
    mcpAuthMiddleware,
    (req: Request, res: Response) => {
      streamableHttpService.handlePost(req, res).catch((err) => {
        logger.error('Failed to handle MCP POST request', err);
        if (!res.headersSent) {
          res.status(500).json({ error: 'Internal server error' });
        }
      });
    },
  );

  expressApp.get(
    ['/mcp', '/mcp/claude'],
    mcpAccessModeMiddleware,
    toolsetsQueryMiddleware,
    mcpAuthMiddleware,
    (req: Request, res: Response) => {
      streamableHttpService.handleGet(req, res).catch((err) => {
        logger.error('Failed to handle MCP GET request', err);
        if (!res.headersSent) {
          res.status(500).json({ error: 'Internal server error' });
        }
      });
    },
  );

  expressApp.delete(
    ['/mcp', '/mcp/claude'],
    mcpAccessModeMiddleware,
    toolsetsQueryMiddleware,
    mcpAuthMiddleware,
    (req: Request, res: Response) => {
      streamableHttpService.handleDelete(req, res).catch((err) => {
        logger.error('Failed to handle MCP DELETE request', err);
        if (!res.headersSent) {
          res.status(500).json({ error: 'Internal server error' });
        }
      });
    },
  );

  // The `/mcp` routes above are the only transport that serves MCP traffic;
  // record that they are live so health and manifest endpoints report the real
  // thing rather than a separate, unused server instance.
  streamableHttpService.markTransportMounted();

  app.use('/', (req: Request, res: Response, next: NextFunction) => {
    const clientLogo = resolveClientLogo(req.path);
    if (clientLogo) {
      res
        .type('image/svg+xml')
        .set('Cache-Control', 'public, max-age=86400')
        .send(clientLogo);
      return;
    }

    const setupTab = resolveSetupPageTab(req.path);
    if (setupTab) {
      const preferred = req.accepts(['html', 'json']);
      if (preferred === 'json') {
        res.json({
          endpoint: getPublicMcpUrl(),
          service: 'mcp',
          status: 'healthy',
          transport: 'streamable-http',
        });
        return;
      }

      res.type('html').send(renderSetupPage(setupTab));
      return;
    }

    if (req.path === '/v1') {
      res.redirect('/v1/docs');
    } else {
      next();
    }
  });

  app.setGlobalPrefix('v1');

  await app.listen(port);

  logger.debug(`MCP service is running on port ${port}`);
  logger.debug(
    `Streamable HTTP transport available at /mcp: ${streamableHttpService.isTransportReady()}`,
  );
  logger.debug(
    `OAuth protected resource ${mcpResource.identifier} (from ${mcpResource.sourceKey ?? 'the built-in default'})`,
  );
}

void main().catch((error: unknown) => {
  const bootstrapLogger = new Logger('McpBootstrap');
  if (error instanceof McpResourceConfigurationError) {
    bootstrapLogger.error(`Refusing to start MCP service: ${error.message}`);
  } else {
    bootstrapLogger.error('Failed to start MCP service:', error);
  }
  process.exit(1);
});
setupGracefulShutdown();
