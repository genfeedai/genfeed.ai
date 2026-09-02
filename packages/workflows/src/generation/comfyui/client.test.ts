import type {
  ComfyUIHistoryEntry,
  ComfyUIPrompt,
  ComfyUIQueuePromptResponse,
} from '@genfeedai/contracts/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ComfyUIClient } from './client';

function historyEntry(
  overrides: Partial<ComfyUIHistoryEntry['status']> = {},
): ComfyUIHistoryEntry {
  return {
    outputs: {},
    prompt: [0, 'prompt-1', {}, {}],
    status: {
      completed: true,
      messages: [],
      status_str: 'success',
      ...overrides,
    },
  };
}

describe('ComfyUIClient', () => {
  let client: ComfyUIClient;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    client = new ComfyUIClient('https://comfy.example');
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('queues a JSON prompt and returns the queue response', async () => {
    const prompt: ComfyUIPrompt = {
      '1': { class_type: 'KSampler', inputs: { seed: 42 } },
    };
    const queued: ComfyUIQueuePromptResponse = {
      node_errors: {},
      number: 7,
      prompt_id: 'prompt-1',
    };
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify(queued), { status: 200 }),
    );

    await expect(client.queuePrompt(prompt)).resolves.toEqual(queued);
    expect(fetchMock).toHaveBeenCalledWith('https://comfy.example/prompt', {
      body: JSON.stringify({ prompt }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    });
  });

  it('surfaces the prompt endpoint status and response body', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response('queue full', { status: 503 }),
    );

    await expect(client.queuePrompt({})).rejects.toThrow(
      'ComfyUI /prompt failed (503): queue full',
    );
  });

  it('returns the requested history entry and permits a missing prompt', async () => {
    const completed = historyEntry();
    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ 'prompt-1': completed }), {
          status: 200,
        }),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({}), { status: 200 }));

    await expect(client.getHistory('prompt-1')).resolves.toEqual(completed);
    await expect(client.getHistory('missing')).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://comfy.example/history/prompt-1',
    );
  });

  it('surfaces history endpoint failures', async () => {
    fetchMock.mockResolvedValueOnce(new Response('not found', { status: 404 }));

    await expect(client.getHistory('missing')).rejects.toThrow(
      'ComfyUI /history failed (404): not found',
    );
  });

  it('downloads output bytes with encoded view parameters', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(new Uint8Array([1, 2, 3]), { status: 200 }),
    );

    const output = await client.getOutput('result 1.png', 'folder/name');

    expect(output).toEqual(Buffer.from([1, 2, 3]));
    expect(fetchMock).toHaveBeenCalledWith(
      'https://comfy.example/view?filename=result+1.png&subfolder=folder%2Fname&type=output',
    );
  });

  it('surfaces output endpoint failures without consuming a binary body', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 500 }));

    await expect(client.getOutput('x.png', '')).rejects.toThrow(
      'ComfyUI /view failed (500)',
    );
  });

  it('returns immediately when history reports completion', async () => {
    const completed = historyEntry();
    vi.spyOn(client, 'getHistory').mockResolvedValueOnce(completed);

    await expect(
      client.waitForCompletion('prompt-1', { pollMs: 1, timeoutMs: 10 }),
    ).resolves.toEqual(completed);
  });

  it('surfaces an execution error with the ComfyUI messages', async () => {
    vi.spyOn(client, 'getHistory').mockResolvedValueOnce(
      historyEntry({
        completed: false,
        messages: [['execution_error', { node: '7' }]],
        status_str: 'error',
      }),
    );

    await expect(
      client.waitForCompletion('prompt-1', { pollMs: 1, timeoutMs: 10 }),
    ).rejects.toThrow(
      'ComfyUI prompt prompt-1 failed: [["execution_error",{"node":"7"}]]',
    );
  });

  it('polls until a pending prompt completes', async () => {
    vi.useFakeTimers();
    const completed = historyEntry();
    const getHistory = vi
      .spyOn(client, 'getHistory')
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(completed);

    const pending = client.waitForCompletion('prompt-1', {
      pollMs: 100,
      timeoutMs: 1000,
    });
    await vi.advanceTimersByTimeAsync(100);

    await expect(pending).resolves.toEqual(completed);
    expect(getHistory).toHaveBeenCalledTimes(2);
  });

  it('times out when the prompt never reaches a terminal state', async () => {
    vi.useFakeTimers();
    vi.spyOn(client, 'getHistory').mockResolvedValue(undefined);

    const pending = client.waitForCompletion('prompt-1', {
      pollMs: 100,
      timeoutMs: 100,
    });
    const rejection = expect(pending).rejects.toThrow(
      'ComfyUI prompt prompt-1 timed out after 100ms',
    );
    await vi.advanceTimersByTimeAsync(100);

    await rejection;
  });

  it('reports health from the system stats endpoint', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockRejectedValueOnce(new Error('offline'));

    await expect(client.ping()).resolves.toBe(true);
    await expect(client.ping()).resolves.toBe(false);
    await expect(client.ping()).resolves.toBe(false);
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://comfy.example/system_stats',
    );
  });
});
