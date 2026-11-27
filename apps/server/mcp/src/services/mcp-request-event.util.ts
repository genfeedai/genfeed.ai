/**
 * What the request's wide event records about the JSON-RPC call inside a
 * `POST /mcp`. Every call is the same HTTP request (`POST /mcp 200`), so
 * without the method and the tool name a slow request cannot be attributed
 * to what it did (#11451). Names only: the arguments hold prompt text and ids.
 */

/** A caller-supplied name is logged only when it looks like a name. */
const NAME_PATTERN = /^[A-Za-z0-9_.:/-]{1,64}$/;
const INVALID_NAME = 'invalid';
const MAX_BATCH_ENTRIES = 20;

function readName(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  return NAME_PATTERN.test(value) ? value : INVALID_NAME;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function describeCall(call: unknown): { method?: string; toolName?: string } {
  if (!isRecord(call)) return {};
  const method = readName(call.method);
  const params = call.params;
  const toolName =
    method === 'tools/call' && isRecord(params)
      ? readName(params.name)
      : undefined;
  return { method, toolName };
}

/** Fields for `enrichWideEvent`, empty when the body is not a JSON-RPC call. */
export function describeMcpRequest(body: unknown): Record<string, unknown> {
  if (Array.isArray(body)) {
    const calls = body.slice(0, MAX_BATCH_ENTRIES).map(describeCall);
    const toolNames = calls.flatMap(({ toolName }) =>
      toolName ? [toolName] : [],
    );
    return {
      mcp: {
        batch_size: body.length,
        method: 'batch',
        ...(toolNames.length > 0 ? { tool_names: toolNames } : {}),
      },
    };
  }
  const { method, toolName } = describeCall(body);
  if (!method) return {};
  return { mcp: { method, ...(toolName ? { tool_name: toolName } : {}) } };
}

/** The argument names of a tool call, never their values. */
export function describeToolArguments(args: unknown): {
  argumentKeys: string[];
} {
  return { argumentKeys: isRecord(args) ? Object.keys(args).slice(0, 50) : [] };
}
