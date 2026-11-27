import { McpUpstreamError } from '@mcp/tools/mcp-tool-error';
import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import {
  agentToolTimeoutMs,
  GENERATION_TOOL_TIMEOUT_MS,
} from '../agent-tool-timeouts';
import { AgentClient } from './agent.client';
import { BaseApiClient } from './base-api-client';

const LOAD_BALANCER_IDLE_TIMEOUT_MS = 60_000;
const NEVER = Number.POSITIVE_INFINITY;

/**
 * Real axios and the real clients; only the network is replaced. The API
 * "takes" `apiLatencyMs`: it answers when that fits the budget the request
 * carries, and otherwise the request fails the way axios fails a timeout.
 */
function build(apiLatencyMs: number) {
  const adapter = async (config: InternalAxiosRequestConfig) => {
    const budget = config.timeout || NEVER;
    if (apiLatencyMs > budget) {
      throw new AxiosError(
        `timeout of ${budget}ms exceeded`,
        AxiosError.ECONNABORTED,
        config,
      );
    }
    return {
      config,
      data: { data: { text: 'generated' }, success: true },
      headers: {},
      status: 200,
      statusText: 'OK',
    };
  };
  const base = new BaseApiClient(
    { debug: vi.fn(), error: vi.fn(), warn: vi.fn() } as never,
    {
      axiosRef: {
        create: (config: object) => axios.create({ ...config, adapter }),
      },
    } as never,
    { get: () => undefined } as never,
  );
  return new AgentClient(base);
}

describe('an agent tool that waits on a model', () => {
  it('gives generation its own budget, under what the load balancer allows', () => {
    expect(agentToolTimeoutMs('generate')).toBe(GENERATION_TOOL_TIMEOUT_MS);
    expect(agentToolTimeoutMs('generate_content')).toBe(
      GENERATION_TOOL_TIMEOUT_MS,
    );
    expect(GENERATION_TOOL_TIMEOUT_MS).toBeGreaterThan(30_000);
    expect(GENERATION_TOOL_TIMEOUT_MS).toBeLessThan(
      LOAD_BALANCER_IDLE_TIMEOUT_MS,
    );
    expect(agentToolTimeoutMs('get_brands')).toBeUndefined();
    expect(agentToolTimeoutMs('constructor')).toBeUndefined();
  });

  it('returns the result of a generation that answers after 40 s', async () => {
    const client = build(40_000);

    await expect(
      client.executeAgentTool(
        'generate_content',
        { topic: 'launch' },
        undefined,
        agentToolTimeoutMs('generate_content'),
      ),
    ).resolves.toMatchObject({ data: { text: 'generated' } });
  });

  it('still cuts a call with no budget of its own at 30 s', async () => {
    const client = build(40_000);

    await expect(client.executeAgentTool('get_brands', {})).rejects.toThrow(
      McpUpstreamError,
    );
  });

  it('answers a 30 s call that has no budget of its own', async () => {
    const client = build(29_000);

    await expect(
      client.executeAgentTool('get_brands', {}),
    ).resolves.toMatchObject({ data: { text: 'generated' } });
  });

  it('fails a generation that never answers at its own budget with the upstream error', async () => {
    const client = build(NEVER);

    const failure = await client
      .executeAgentTool(
        'generate_content',
        { topic: 'launch' },
        undefined,
        agentToolTimeoutMs('generate_content'),
      )
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(McpUpstreamError);
    expect((failure as McpUpstreamError).message).toBe(
      'Failed to execute generate_content',
    );
  });

  it('fails a generation just over its budget, and not one just under it', async () => {
    const run = (latencyMs: number) =>
      build(latencyMs).executeAgentTool(
        'generate',
        {},
        undefined,
        agentToolTimeoutMs('generate'),
      );

    await expect(run(GENERATION_TOOL_TIMEOUT_MS)).resolves.toBeDefined();
    await expect(run(GENERATION_TOOL_TIMEOUT_MS + 1)).rejects.toThrow(
      McpUpstreamError,
    );
  });
});
