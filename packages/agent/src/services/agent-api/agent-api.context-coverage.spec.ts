import { getContextCoverage } from '@genfeedai/agent/services/agent-api/agent-api.context-coverage';
import type { AgentBaseApiService } from '@genfeedai/agent/services/agent-base-api.service';
import { describe, expect, it, vi } from 'vitest';

function build(response: unknown) {
  const fetchJson = vi.fn().mockResolvedValue(response);
  const api = {
    config: { baseUrl: 'https://api.test' },
    fetchJson,
  } as unknown as AgentBaseApiService;
  return { api, fetchJson };
}

describe('getContextCoverage', () => {
  it('calls the canonical tool with the thread brand and returns its data', async () => {
    const data = { families: [], isIncomplete: false, usage: 'search' };
    const { api, fetchJson } = build({ data, success: true });
    const signal = new AbortController().signal;

    await expect(
      getContextCoverage(api, { brandId: 'brand-1' }, signal),
    ).resolves.toEqual(data);

    const [url, init] = fetchJson.mock.calls[0] ?? [];
    expect(url).toBe(
      'https://api.test/agent-tools/get_context_coverage/execute',
    );
    expect(init.method).toBe('POST');
    expect(init.signal).toBe(signal);
    expect(JSON.parse(init.body)).toEqual({
      context: { brandId: 'brand-1' },
      parameters: { usage: 'search' },
    });
  });

  it('sends no brand context for a thread without a brand', async () => {
    const { api, fetchJson } = build({
      data: { families: [], isIncomplete: false, usage: 'context' },
      success: true,
    });

    await getContextCoverage(api, { usage: 'context' });

    expect(JSON.parse(fetchJson.mock.calls[0]?.[1].body)).toEqual({
      parameters: { usage: 'context' },
    });
  });

  it('rejects an unsuccessful tool result', async () => {
    const { api } = build({ error: 'nope', success: false });

    await expect(getContextCoverage(api, {})).rejects.toThrow(
      'Context coverage is unavailable',
    );
  });
});
