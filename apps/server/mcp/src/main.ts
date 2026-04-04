import { bootstrap, setupGracefulShutdown } from '@libs/bootstrap';
import '@mcp/instrument';

bootstrap({ app: 'mcp' });

import { getGenfeedCorsOrigins } from '@libs/config/cors.config';
import { LoggerService } from '@libs/logger/logger.service';
import { AppModule } from '@mcp/app.module';
import { ConfigService } from '@mcp/config/config.service';
import { AuthService } from '@mcp/services/auth.service';
import { ServerService } from '@mcp/services/server.service';
import { StreamableHttpService } from '@mcp/services/streamable-http.service';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { NextFunction, Request, Response } from 'express';

interface AuthenticatedRequest extends Request {
  authContext?: {
    token?: string;
    userId?: string;
    organizationId?: string;
  };
}

async function main(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    abortOnError: false,
    logger: ['error'],
    snapshot: true,
  });

  const configService = app.get(ConfigService);
  const logger = app.get(LoggerService);
  const serverService = app.get(ServerService);
  const authService = app.get(AuthService);
  const streamableHttpService = app.get(StreamableHttpService);

  const port = configService.get('PORT');

  app.enableCors({
    credentials: true,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    origin: getGenfeedCorsOrigins({
      additionalOrigins: ['https://mcp.genfeed.ai'],
      chromeExtensionId: configService.get('CHROME_EXTENSION_ID'),
      isDevelopment: configService.get('NODE_ENV') === 'development',
    }),
  });

  const expressApp = app.getHttpAdapter().getInstance();

  const mcpAuthMiddleware = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ) => {
    const token = authService.extractBearerToken(req.headers.authorization);

    if (!token) {
      res
        .status(401)
        .json({ error: 'Authorization header with Bearer token required' });
      return;
    }

    const authResult = await authService.authenticateRequest(token);

    if (!authResult.valid) {
      res.status(401).json({ error: authResult.error || 'Invalid token' });
      return;
    }

    req.authContext = {
      organizationId: authResult.organizationId,
      token,
      userId: authResult.userId,
    };

    next();
  };

  expressApp.post('/mcp', mcpAuthMiddleware, (req: Request, res: Response) => {
    streamableHttpService.handlePost(req, res).catch((err) => {
      logger.error('Failed to handle MCP POST request', err);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Internal server error' });
      }
    });
  });

  expressApp.get('/mcp', mcpAuthMiddleware, (req: Request, res: Response) => {
    streamableHttpService.handleGet(req, res).catch((err) => {
      logger.error('Failed to handle MCP GET request', err);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Internal server error' });
      }
    });
  });

  expressApp.delete('/mcp', (req: Request, res: Response) => {
    streamableHttpService.handleDelete(req, res).catch((err) => {
      logger.error('Failed to handle MCP DELETE request', err);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Internal server error' });
      }
    });
  });

  app.use('/', (req: Request, res: Response, next: NextFunction) => {
    const redirectPaths = ['/', '/docs', '/v1'];
    if (redirectPaths.includes(req.path)) {
      res.redirect('/v1/docs');
    } else {
      next();
    }
  });

  app.setGlobalPrefix('v1');

  await app.listen(port);

  logger.debug(`MCP service is running on port ${port}`);
  logger.debug(`MCP Server initialized: ${serverService.isServerRunning()}`);
  logger.debug('Streamable HTTP transport available at /mcp');
}

void main().catch((error: unknown) => {
  const bootstrapLogger = new Logger('McpBootstrap');
  bootstrapLogger.error('Failed to start MCP service:', error);
  process.exit(1);
});
setupGracefulShutdown();
