import { rejectMcpRequestIfApiKeyInUrl } from '@libs/auth/url-credentials';
import { isPublicMcpRequest } from '@mcp/mcp/public-discovery';
import { getMcpWwwAuthenticateHeader } from '@mcp/mcp/setup-page';
import { AUTH_UNAVAILABLE_RETRY_AFTER_SECONDS } from '@mcp/services/auth.service';
import { applyRateLimitHeaders } from '@mcp/services/rate-limit.service';
import type { McpAuthMiddlewareDependencies } from '@mcp/shared/interfaces/mcp-auth-middleware.interface';
import type { McpRequest } from '@mcp/shared/interfaces/mcp-request.interface';
import {
  classifyMcpToolFailure,
  mcpJsonRpcError,
} from '@mcp/tools/mcp-tool-error';
import type { NextFunction, Response } from 'express';

export function createMcpAuthMiddleware({
  authService,
  rateLimitService,
}: McpAuthMiddlewareDependencies) {
  return async (req: McpRequest, res: Response, next: NextFunction) => {
    if (
      rejectMcpRequestIfApiKeyInUrl(
        req,
        res,
        getMcpWwwAuthenticateHeader(req.routeAccessMode),
      )
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
      const message = `Rate limit exceeded. Retry after ${rateLimit.retryAfterSeconds}s.`;
      const rateLimited = classifyMcpToolFailure({
        message,
        retryAfterSeconds: rateLimit.retryAfterSeconds,
        status: 429,
      });
      res.status(429).json(
        rateLimited
          ? mcpJsonRpcError(null, -32029, rateLimited)
          : {
              error: { code: -32029, message },
              id: null,
              jsonrpc: '2.0',
            },
      );
      return;
    }

    if (!token) {
      if (isPublicMcpRequest(req.body)) {
        next();
        return;
      }

      res.setHeader(
        'WWW-Authenticate',
        getMcpWwwAuthenticateHeader(req.routeAccessMode),
      );
      const message =
        'Unauthorized. Authorize this client with Genfeed OAuth, or send a Genfeed API key as a bearer token.';
      const unauthorized = classifyMcpToolFailure({ message, status: 401 });
      res.status(401).json(
        unauthorized
          ? mcpJsonRpcError(null, -32001, unauthorized)
          : {
              error: { code: -32001, message },
              id: null,
              jsonrpc: '2.0',
            },
      );
      return;
    }

    const authResult = await authService.authenticateRequest(token);

    if (authResult.isRateLimited) {
      const retryAfterSeconds =
        authResult.retryAfterSeconds ?? AUTH_UNAVAILABLE_RETRY_AFTER_SECONDS;
      const message = authResult.error || 'Rate limited by the Genfeed API';
      res.setHeader('Retry-After', String(retryAfterSeconds));
      const rateLimited = classifyMcpToolFailure({
        message,
        retryAfterSeconds,
        status: 429,
      });
      res.status(429).json(
        rateLimited
          ? mcpJsonRpcError(null, -32029, rateLimited)
          : {
              error: { code: -32029, message },
              id: null,
              jsonrpc: '2.0',
            },
      );
      return;
    }

    // The identity check failed, not the token: a 401 here would make the
    // client drop a good connection and ask the user to authorize again.
    if (authResult.isUnavailable) {
      res.setHeader(
        'Retry-After',
        `${authResult.retryAfterSeconds ?? AUTH_UNAVAILABLE_RETRY_AFTER_SECONDS}`,
      );
      res.status(503).json({
        error: {
          code: -32002,
          message: 'Genfeed could not verify your connection. Retry shortly.',
        },
        id: null,
        jsonrpc: '2.0',
      });
      return;
    }

    if (
      !authResult.valid ||
      (req.routeAccessMode === 'claude' && authResult.accessMode !== 'claude')
    ) {
      res.setHeader(
        'WWW-Authenticate',
        getMcpWwwAuthenticateHeader(req.routeAccessMode),
      );
      const message = authResult.valid
        ? 'Authorize the Claude connector with its own browser OAuth connection. Existing standard tokens and manual API keys cannot be used here.'
        : authResult.error || 'Invalid token';
      const unauthorized = classifyMcpToolFailure({ message, status: 401 });
      res.status(401).json(
        unauthorized
          ? mcpJsonRpcError(null, -32001, unauthorized)
          : {
              error: { code: -32001, message },
              id: null,
              jsonrpc: '2.0',
            },
      );
      return;
    }

    req.authContext = {
      accessMode: authResult.accessMode,
      organizationId: authResult.organizationId,
      role: authResult.role || 'user',
      token,
      userId: authResult.userId,
    };

    next();
  };
}
