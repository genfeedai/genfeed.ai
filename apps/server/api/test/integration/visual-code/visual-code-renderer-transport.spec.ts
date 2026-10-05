import { VisualProjectRendererClientService } from '@api/collections/visual-projects/services/visual-project-renderer-client.service';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createVisualRendererTransport } from './visual-code-acceptance.fixture';

function fixture() {
  const calls = {
    routes: [],
    llm: [],
    renderer: [],
    rendererSubmissions: [],
    uploads: [],
    liveClaims: [],
  };
  const transport = createVisualRendererTransport(
    calls,
    Buffer.from('png'),
    Buffer.from('mp4'),
  );
  const options = {
    headers: { authorization: 'Bearer fixture-renderer-token' },
    redirect: 'error' as const,
  };
  return { calls, transport, options };
}

afterEach(() => vi.unstubAllGlobals());

describe('captured renderer protocol', () => {
  it('returns a real 404 for missing jobs and lets the real client recover without submitting', async () => {
    const { calls, transport, options } = fixture();
    const response = await transport(
      'https://visual-renderer.example.test/jobs/missing',
      options,
    );
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'not_found' });
    vi.stubGlobal('fetch', transport);
    const values = {
      VISUAL_CODE_RENDERER_ENABLED: 'true',
      VISUAL_CODE_RENDERER_URL: 'https://visual-renderer.example.test',
      VISUAL_CODE_RENDERER_TOKEN: 'fixture-renderer-token',
      VISUAL_CODE_RENDER_CREDITS_PER_SECOND: '0.01',
    };
    const client = new VisualProjectRendererClientService({
      get: (key: keyof typeof values) => values[key],
    } as never);
    await expect(client.recoverStopped('missing')).resolves.toBeNull();
    expect(calls.renderer).toEqual(['GET /jobs/missing', 'GET /jobs/missing']);
    expect(calls.rendererSubmissions).toEqual([]);
    expect(calls.uploads).toEqual([]);
    expect(calls.llm).toEqual([]);
  });

  it('preserves successful created receipts and result bytes', async () => {
    const { transport, options } = fixture();
    const input = {
      id: 'created',
      mode: 'export',
      sourceCode: 'fixture',
      settings: { width: 640, height: 360, fps: 30, durationFrames: 30 },
      outputs: [{ format: 'png', frame: 0 }],
    };
    const receipt = await (
      await transport('https://visual-renderer.example.test/jobs', {
        ...options,
        method: 'POST',
        body: JSON.stringify(input),
      })
    ).json();
    expect(
      await (
        await transport(
          'https://visual-renderer.example.test/jobs/created',
          options,
        )
      ).json(),
    ).toEqual(receipt);
    const result = await transport(
      'https://visual-renderer.example.test/jobs/created/result',
      options,
    );
    expect(result.status).toBe(200);
    const bytes = Buffer.from(await result.arrayBuffer());
    expect(bytes.readUInt32BE(0)).toBe(bytes.length - 4);
    expect(JSON.parse(bytes.subarray(4).toString()).media[0].bytes).toBe(
      Buffer.from('png').toString('base64'),
    );
  });

  it.each(['origin', 'authorization', 'redirect'])(
    'still refuses invalid %s',
    async (kind) => {
      const { transport, options } = fixture();
      await expect(
        transport(
          kind === 'origin'
            ? 'https://wrong.example.test/jobs/missing'
            : 'https://visual-renderer.example.test/jobs/missing',
          {
            ...options,
            ...(kind === 'authorization' ? { headers: {} } : {}),
            ...(kind === 'redirect' ? { redirect: 'follow' as const } : {}),
          },
        ),
      ).rejects.toThrow('Unexpected renderer transport');
    },
  );
});
