import {
  DEFAULT_MCP_PROFILE_TOOLSETS,
  DIRECTORY_MCP_PROFILE_TOOLSETS,
} from '@genfeedai/actions';
import type { McpRequest } from '@mcp/shared/interfaces/mcp-request.interface';
import {
  buildUnknownToolsetsMessage,
  resolveMcpToolQuery,
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
      empty: [],
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

  it('treats an absent param as no toolset selection', () => {
    expect(resolveRequestToolsets({})).toEqual({
      empty: [],
      toolsets: [],
      unknown: [],
    });
  });

  it('keeps a declared toolset that has no MCP tools instead of calling it unknown', () => {
    // `goals` is a real declared toolset name with no tools on the `mcp`
    // surface. It must not 400. It stays selected so the connection does
    // not widen to every tool, and `empty` is the list_toolsets warning.
    const selection = resolveRequestToolsets({ toolsets: 'goals' });

    expect(selection.toolsets).toEqual(['goals']);
    expect(selection.empty).toEqual(['goals']);
    expect(selection.unknown).toEqual([]);
  });
});

describe('resolveMcpToolQuery', () => {
  it('uses the default profile when neither toolsets nor profile is set', () => {
    expect(resolveMcpToolQuery({})).toEqual({
      empty: [],
      toolsets: [...DEFAULT_MCP_PROFILE_TOOLSETS],
      unknown: [],
      unknownProfile: null,
    });
  });

  it('resolves ?profile=directory and ?profile=full', () => {
    expect(resolveMcpToolQuery({ profile: 'directory' }).toolsets).toEqual([
      ...DIRECTORY_MCP_PROFILE_TOOLSETS,
    ]);
    expect(resolveMcpToolQuery({ profile: 'FULL' })).toEqual({
      empty: [],
      toolsets: [],
      unknown: [],
      unknownProfile: null,
    });
  });

  it('lets an explicit ?toolsets= win over ?profile=', () => {
    const selection = resolveMcpToolQuery({
      profile: 'full',
      toolsets: 'content',
    });

    expect(selection.toolsets).toEqual(['content']);
    expect(selection.unknownProfile).toBeNull();
  });

  it('reports an unknown profile and still rejects an undeclared toolset', () => {
    expect(resolveMcpToolQuery({ profile: 'nope' }).unknownProfile).toBe(
      'nope',
    );
    expect(
      resolveMcpToolQuery({ toolsets: 'not-a-real-toolset' }).unknown,
    ).toEqual(['not-a-real-toolset']);
  });

  it('does not fail a profile or toolsets query that only names an empty toolset', () => {
    const selection = resolveMcpToolQuery({ toolsets: 'content,goals' });

    expect(selection.unknown).toEqual([]);
    expect(selection.empty).toEqual(['goals']);
    expect(selection.toolsets).toEqual(['content', 'goals']);
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

  it('caps the echoed unknown names at 5 and summarizes the rest', () => {
    const unknown = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];

    const message = buildUnknownToolsetsMessage(unknown);
    // Only the "Unknown toolset(s): ..." clause is under test here — the
    // "Valid toolsets: ..." clause is a real (unmocked) catalog listing and
    // may itself contain single letters like "g" (e.g. "generation"), so
    // asserting against the whole message would be a false negative.
    const unknownClause = message.split('. Valid toolsets:')[0];

    expect(unknownClause).toBe('Unknown toolset(s): a, b, c, d, e (+2 more)');
  });

  it('does not append a "more" suffix when the unknown list is within the cap', () => {
    const message = buildUnknownToolsetsMessage(['a', 'b']);

    expect(message).toContain('Unknown toolset(s): a, b.');
    expect(message).not.toContain('more');
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

  it('defaults a bare request to the default profile', () => {
    const { req, res, next } = buildContext({});

    toolsetsQueryMiddleware(req, res, next);

    expect(req.toolsets).toEqual([...DEFAULT_MCP_PROFILE_TOOLSETS]);
    expect(next).toHaveBeenCalledOnce();
  });

  it('does not 400 when the only requested toolset is empty on this deploy', () => {
    const { req, res, next, status } = buildContext({ toolsets: 'goals' });

    toolsetsQueryMiddleware(req, res, next);

    expect(status).not.toHaveBeenCalled();
    expect(req.toolsets).toEqual(['goals']);
    expect(next).toHaveBeenCalledOnce();
  });

  it('responds 400 for an unknown profile and never calls next', () => {
    const { req, res, status, json, next } = buildContext({
      profile: 'nope',
    });

    toolsetsQueryMiddleware(req, res, next);

    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({
          code: -32602,
          message: expect.stringContaining('Unknown profile: nope'),
        }),
        id: null,
        jsonrpc: '2.0',
      }),
    );
    expect(next).not.toHaveBeenCalled();
    expect(req.toolsets).toBeUndefined();
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
