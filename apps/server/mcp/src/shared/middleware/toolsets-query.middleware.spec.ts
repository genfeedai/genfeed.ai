import type { McpRequest } from '@mcp/shared/interfaces/mcp-request.interface';
import {
  buildUnknownToolsetsMessage,
  resolveRequestToolsets,
  toolsetsQueryMiddleware,
} from '@mcp/shared/middleware/toolsets-query.middleware';
import type { NextFunction, Response } from 'express';

/**
 * Unit coverage for the `?toolsets=` query parsing that gates the `/mcp`
 * transport before authentication runs (so it applies to unauthenticated
 * public `tools/list` too) and the `GET /v1/tools` REST mirror.
 */
describe('resolveRequestToolsets', () => {
  it('parses a comma-separated query param into known toolsets', () => {
    const selection = resolveRequestToolsets({
      toolsets: 'content,generation',
    });

    expect(selection).toEqual({
      toolsets: ['content', 'generation'],
      unknown: [],
    });
  });

  it('flattens a repeated query param (?toolsets=a&toolsets=b)', () => {
    const selection = resolveRequestToolsets({
      toolsets: ['content', 'generation'],
    });

    expect(selection.toolsets).toEqual(['content', 'generation']);
    expect(selection.unknown).toEqual([]);
  });

  it('collects unknown toolset names without throwing', () => {
    const selection = resolveRequestToolsets({
      toolsets: 'content,not-a-real-toolset',
    });

    expect(selection.toolsets).toEqual(['content']);
    expect(selection.unknown).toEqual(['not-a-real-toolset']);
  });

  it('treats an absent param as "every toolset"', () => {
    expect(resolveRequestToolsets({})).toEqual({ toolsets: [], unknown: [] });
  });
});

describe('buildUnknownToolsetsMessage', () => {
  it('names the unknown toolset and lists the valid ones', () => {
    const message = buildUnknownToolsetsMessage(['bogus-toolset']);

    expect(message).toContain('Unknown toolset(s): bogus-toolset');
    expect(message).toContain('Valid toolsets:');
    expect(message).toContain('core');
  });

  it('joins multiple unknown names', () => {
    const message = buildUnknownToolsetsMessage(['bogus-one', 'bogus-two']);

    expect(message).toContain('Unknown toolset(s): bogus-one, bogus-two');
  });
});

describe('toolsetsQueryMiddleware', () => {
  function buildContext(query: Record<string, unknown>) {
    const req = { query } as unknown as McpRequest;
    const json = vi.fn();
    const status = vi.fn().mockReturnValue({ json });
    const res = { status } as unknown as Response;
    const next = vi.fn() as unknown as NextFunction;
    return { json, next, req, res, status };
  }

  it('stores the parsed toolsets on the request and calls next', () => {
    const { req, res, next } = buildContext({ toolsets: 'content' });

    toolsetsQueryMiddleware(req, res, next);

    expect(req.toolsets).toEqual(['content']);
    expect(next).toHaveBeenCalledOnce();
  });

  it('defaults req.toolsets to an empty selection when unset', () => {
    const { req, res, next } = buildContext({});

    toolsetsQueryMiddleware(req, res, next);

    expect(req.toolsets).toEqual([]);
    expect(next).toHaveBeenCalledOnce();
  });

  it('responds 400 with a JSON-RPC error and never calls next for an unknown toolset', () => {
    const { req, res, status, json, next } = buildContext({
      toolsets: 'not-a-real-toolset',
    });

    toolsetsQueryMiddleware(req, res, next);

    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({
          code: -32602,
          message: expect.stringContaining(
            'Unknown toolset(s): not-a-real-toolset',
          ),
        }),
        id: null,
        jsonrpc: '2.0',
      }),
    );
    expect(next).not.toHaveBeenCalled();
    expect(req.toolsets).toBeUndefined();
  });
});
