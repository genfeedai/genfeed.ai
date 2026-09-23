import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { getPublicAppUrl } from '@mcp/mcp/setup-page';
import { HttpException, HttpStatus } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import {
  approvalPendingToolResult,
  classifyMcpToolFailure,
  type McpToolError,
  McpUpstreamError,
  mcpJsonRpcError,
  toMcpToolErrorResult,
} from './mcp-tool-error';

function appUrl(path: string): string {
  return `${getPublicAppUrl()}${path}`;
}

describe('MCP tool error contract', () => {
  it('returns unauthorized with the connect link', () => {
    const error = classifyMcpToolFailure({
      message:
        'Unauthorized. Authorize this client with Genfeed OAuth, or send a Genfeed API key as a bearer token.',
      status: 401,
    });

    expect(error).toEqual({
      code: 'unauthorized',
      message:
        'Unauthorized. Authorize this client with Genfeed OAuth, or send a Genfeed API key as a bearer token.',
      nextStepUrl: appUrl(APP_ROUTES.CONNECT),
    });
    expect(
      mcpJsonRpcError(null, -32001, error as McpToolError).error.data,
    ).toEqual(error);
  });

  it('returns plan_required for the existing paid-plan and billing gates', () => {
    expect(
      classifyMcpToolFailure({
        domainCode: 'PLAN_LIMIT_EXCEEDED',
        message:
          'API access is available on paid plans. Upgrade to Pro to create and use API keys.',
        status: 403,
        title: 'API access requires a paid plan',
      }),
    ).toEqual({
      code: 'plan_required',
      message:
        'API access is available on paid plans. Upgrade to Pro to create and use API keys.',
      nextStepUrl: appUrl(APP_ROUTES.SETTINGS.SUBSCRIPTION),
    });

    expect(
      classifyMcpToolFailure({
        message:
          'An active subscription is required to use this feature. Please subscribe to a plan.',
        status: 403,
        title: 'Active subscription required',
      })?.code,
    ).toBe('plan_required');

    expect(
      classifyMcpToolFailure({
        message:
          'Organization-wide memory listing requires organization billing.',
        status: 403,
      })?.nextStepUrl,
    ).toBe(appUrl(APP_ROUTES.SETTINGS.SUBSCRIPTION));
  });

  it('returns insufficient_credits for the ledger exception', () => {
    const error = classifyMcpToolFailure({
      domainCode: 'INSUFFICIENT_CREDITS',
      message: 'Insufficient credits: 10 required, 3 available',
      status: 422,
    });

    expect(error).toEqual({
      code: 'insufficient_credits',
      message: 'Insufficient credits: 10 required, 3 available',
      nextStepUrl: appUrl(APP_ROUTES.SETTINGS.CREDITS),
    });
  });

  it('returns rate_limited with retryAfterSeconds and no invented URL', () => {
    const error = classifyMcpToolFailure({
      message: 'Rate limit exceeded. Retry after 42s.',
      retryAfterSeconds: 42,
      status: 429,
    });

    expect(error).toEqual({
      code: 'rate_limited',
      message: 'Rate limit exceeded. Retry after 42s.',
      retryAfterSeconds: 42,
    });
    expect(error).not.toHaveProperty('nextStepUrl');
  });

  it('returns validation_failed with the REST validator field errors', () => {
    const upstream = new McpUpstreamError('Validation failed', {
      body: {
        errors: [
          {
            detail: 'prompt must be a string',
            source: { pointer: '/prompt' },
            title: 'Validation failed',
          },
          {
            detail: 'tone must be a valid tone',
            source: { pointer: '/tone' },
            title: 'Validation failed',
          },
        ],
      },
      status: 400,
    });

    const result = toMcpToolErrorResult(upstream);

    expect(result?.isError).toBe(true);
    expect(result?.structuredContent).toEqual({
      code: 'validation_failed',
      errors: [
        { field: 'prompt', message: 'prompt must be a string' },
        { field: 'tone', message: 'tone must be a valid tone' },
      ],
      message: 'Validation failed',
    });
    expect(result?.content[0]).toEqual({
      text: JSON.stringify(result?.structuredContent, null, 2),
      type: 'text',
    });
    expect(result?.structuredContent).not.toHaveProperty('nextStepUrl');
  });

  it('returns approval_pending with the publishing approval queue', () => {
    const result = approvalPendingToolResult({
      id: 'apr-1',
      status: 'PENDING',
      toolName: 'create_post',
    });

    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({
      code: 'approval_pending',
      nextStepUrl: appUrl(APP_ROUTES.PUBLISHING.REVIEW),
    });
    expect(result.structuredContent.message).toContain('requires approval');
    expect(result.structuredContent.message).toContain('apr-1');
    expect(result.structuredContent).not.toHaveProperty('retryAfterSeconds');
  });

  it('keeps ValidationPipe property errors and required arguments retryable', () => {
    const pipe = toMcpToolErrorResult(
      new HttpException(
        {
          errors: [
            {
              constraints: { isString: 'prompt must be a string' },
              property: 'prompt',
            },
          ],
          message: 'Validation failed',
        },
        HttpStatus.BAD_REQUEST,
      ),
    );

    expect(pipe?.structuredContent).toEqual({
      code: 'validation_failed',
      errors: [{ field: 'prompt', message: 'prompt must be a string' }],
      message: 'prompt must be a string',
    });
    expect(classifyMcpToolFailure({ message: 'videoId required' })).toEqual({
      code: 'validation_failed',
      errors: [{ field: 'videoId', message: 'videoId required' }],
      message: 'videoId required',
    });
  });

  it('reads Retry-After from an upstream 429 and ignores a generic 500', () => {
    expect(
      toMcpToolErrorResult({
        message: 'Too many requests',
        response: {
          data: {},
          headers: { get: () => '15' },
          status: 429,
        },
      })?.structuredContent,
    ).toMatchObject({
      code: 'rate_limited',
      retryAfterSeconds: 15,
    });
    expect(
      toMcpToolErrorResult(new Error('API down'))?.structuredContent,
    ).toBeUndefined();
    expect(
      classifyMcpToolFailure({ message: 'API down', status: 500 }),
    ).toBeNull();
  });
});
