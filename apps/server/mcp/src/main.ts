import {
  bootstrap,
  setupGracefulShutdown,
  setupServiceShell,
} from '@libs/bootstrap';
import '@mcp/instrument';

bootstrap({ app: 'mcp' });

import process from 'node:process';
import { McpResourceConfigurationError } from '@genfeedai/helpers/integrations/mcp-resource.helper';
import { rejectMcpRequestIfApiKeyInUrl } from '@libs/auth/url-credentials';
import {
  getGenfeedCorsOptions,
  shouldAllowLocalCorsOrigins,
} from '@libs/config/cors.config';
import { LoggerService } from '@libs/logger/logger.service';
import { AppModule } from '@mcp/app.module';
import { ConfigService } from '@mcp/config/config.service';
import { isPublicMcpRequest } from '@mcp/mcp/public-discovery';
import {
  getMcpWwwAuthenticateHeader,
  getPublicMcpUrl,
  renderSetupPage,
  resolvePublicMcpResource,
} from '@mcp/mcp/setup-page';
import { registerWellKnownRoutes } from '@mcp/mcp/well-known-routes';
import { AuthService } from '@mcp/services/auth.service';
import {
  applyRateLimitHeaders,
  RateLimitService,
} from '@mcp/services/rate-limit.service';
import { StreamableHttpService } from '@mcp/services/streamable-http.service';
import type { McpRequest } from '@mcp/shared/interfaces/mcp-request.interface';
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

  const mcpAuthMiddleware = async (
    req: McpRequest,
    res: Response,
    next: NextFunction,
  ) => {
    if (
      rejectMcpRequestIfApiKeyInUrl(req, res, getMcpWwwAuthenticateHeader())
    ) {
      return;
    }

    const token = authService.extractBearerToken(req.headers.authorization);

    // Per-caller request cap (sliding window), keyed by hashed token when
    // present, else client IP. Checked before auth so a single client's request
    // rate is bounded even while its identity is being resolved.
    const rateLimit = await rateLimitService.consume(
      rateLimitService.keyFor(token, req.ip),
    );
    applyRateLimitHeaders(res, rateLimit);
    if (!rateLimit.allowed) {
      res.status(429).json({
        error: {
          code: -32029,
          message: `Rate limit exceeded. Retry after ${rateLimit.retryAfterSeconds}s.`,
        },
        id: null,
        jsonrpc: '2.0',
      });
      return;
    }

    if (!token) {
      if (isPublicMcpRequest(req.body)) {
        next();
        return;
      }

      res.setHeader('WWW-Authenticate', getMcpWwwAuthenticateHeader());
      res.status(401).json({
        error: {
          code: -32001,
          message:
            'Unauthorized. Authorize this client with Genfeed OAuth, or send a Genfeed API key as a bearer token.',
        },
        id: null,
        jsonrpc: '2.0',
      });
      return;
    }

    const authResult = await authService.authenticateRequest(token);

    if (!authResult.valid) {
      res.setHeader('WWW-Authenticate', getMcpWwwAuthenticateHeader());
      res.status(401).json({
        error: {
          code: -32001,
          message: authResult.error || 'Invalid token',
        },
        id: null,
        jsonrpc: '2.0',
      });
      return;
    }

    req.authContext = {
      organizationId: authResult.organizationId,
      role: authResult.role || 'user',
      token,
      userId: authResult.userId,
    };

    next();
  };

  registerWellKnownRoutes(expressApp);

  // `toolsetsQueryMiddleware` runs BEFORE authentication so an unknown
  // `?toolsets=` or `?profile=` name is rejected the same way for an
  // authenticated caller and an unauthenticated public discovery request
  // (`tools/list`). A bare URL resolves to the default profile.
  expressApp.post(
    '/mcp',
    express.json({ limit: '1mb' }),
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
    '/mcp',
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
    '/mcp',
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
    if (req.path === '/' || req.path === '/docs') {
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

      res.type('html').send(renderSetupPage());
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
