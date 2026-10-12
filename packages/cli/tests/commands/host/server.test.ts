import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { NATIVE_HOST_MAX_REQUEST_BYTES } from '@genfeedai/contracts/constants';
import { describe, expect, it, vi } from 'vitest';
import type { FetchLike } from '../../../src/commands/host/api-providers';
import { runHost } from '../../../src/commands/host/server';
import {
  createPipes,
  detectRequest,
  EXTENSION_ORIGIN,
  makeHostHome,
  REQUEST_ID,
  refineRequest,
  writeExecutable,
} from './fixtures';

async function startHost(options: {
  config?: Parameters<typeof makeHostHome>[0];
  origin?: string | undefined;
  timeoutMs?: number;
}) {
  const { home, paths } = await makeHostHome(options.config);
  const bin = path.join(home, 'bin');
  const record = path.join(home, 'record');
  await writeExecutable(record, '.keep', 'exit 0');
  const pipes = createPipes();
  const finished = runHost({
    env: { FAKE_RECORD: record, HOME: home, PATH: `${bin}:/usr/bin:/bin` },
    fetchImpl: vi.fn() as unknown as FetchLike,
    homeDirectory: home,
    hostVersion: '9.9.9',
    origin: 'origin' in options ? options.origin : EXTENSION_ORIGIN,
    paths,
    stderr: pipes.stderr,
    stdin: pipes.stdin,
    stdout: pipes.stdout,
    systemDirectories: [],
    timeoutMs: options.timeoutMs ?? 5_000,
  });
  return { bin, finished, home, pipes, record };
}

describe('native host server', () => {
  it('answers detect with providers and no keys', async () => {
    const { bin, finished, pipes } = await startHost({
      config: {
        allowedOrigins: ['chrome-extension://abcdefghijklmnopabcdefghijklmnop/'],
        providers: { 'openai-api': { apiKey: 'sk-secret', model: 'gpt-x' } },
      },
    });
    await writeExecutable(bin, 'claude', 'exit 99');

    pipes.send(detectRequest());
    const [response] = await pipes.waitForFrames(1);
    pipes.stdin.end();
    await finished;

    expect(response).toMatchObject({
      hostVersion: '9.9.9',
      requestId: REQUEST_ID,
      type: 'detected',
    });
    const providers = (response as { providers: Array<{ id: string; isAvailable: boolean }> })
      .providers;
    expect(providers.find((p) => p.id === 'claude-cli')?.isAvailable).toBe(true);
    expect(providers.find((p) => p.id === 'openai-api')?.isAvailable).toBe(true);
    expect(JSON.stringify(response)).not.toContain('sk-secret');
  });

  it('serves several requests on one pipe, in order', async () => {
    const { bin, finished, pipes } = await startHost({});
    await writeExecutable(bin, 'claude', `cat > /dev/null\nprintf 'The launch is live @ada #ship'`);

    pipes.send(refineRequest());
    pipes.send(detectRequest());
    const frames = await pipes.waitForFrames(2);
    pipes.stdin.end();
    await finished;

    expect(frames.map((frame) => (frame as { type: string }).type)).toEqual([
      'generated',
      'detected',
    ]);
  });

  it('refuses every request from an origin the install did not register', async () => {
    const { bin, finished, pipes, record } = await startHost({
      origin: 'chrome-extension://ppppppppppppppppppppppppppppppp/',
    });
    await writeExecutable(bin, 'claude', `touch "$FAKE_RECORD/ran"`);

    pipes.send(refineRequest());
    const [response] = await pipes.waitForFrames(1);
    pipes.stdin.end();
    await finished;

    expect(response).toMatchObject({ code: 'origin_not_allowed', type: 'failed' });
    await expect(readFile(path.join(record, 'ran'), 'utf8')).rejects.toThrow();
  });

  it('refuses a host started without an origin', async () => {
    const { finished, pipes } = await startHost({ origin: undefined });
    pipes.send(detectRequest());
    const [response] = await pipes.waitForFrames(1);
    pipes.stdin.end();
    await finished;
    expect(response).toMatchObject({ code: 'origin_not_allowed' });
  });

  it('answers an unsupported version and an invalid request with their request id', async () => {
    const { finished, pipes } = await startHost({});

    pipes.send({ ...detectRequest(), version: 7 });
    pipes.send({ ...refineRequest(), providerId: 'not-a-provider' });
    pipes.send('not an object');
    const frames = await pipes.waitForFrames(3);
    pipes.stdin.end();
    await finished;

    expect(frames).toEqual([
      expect.objectContaining({ code: 'unsupported_version', requestId: REQUEST_ID }),
      expect.objectContaining({ code: 'invalid_request', requestId: REQUEST_ID }),
      expect.objectContaining({ code: 'unsupported_version', requestId: null }),
    ]);
  });

  it('turns a provider failure into a failed response', async () => {
    const { finished, pipes } = await startHost({});
    pipes.send(refineRequest());
    const [response] = await pipes.waitForFrames(1);
    pipes.stdin.end();
    await finished;
    expect(response).toMatchObject({ code: 'provider_unavailable', type: 'failed' });
  });

  it('stops reading after an oversized frame and says so', async () => {
    const { finished, pipes } = await startHost({});
    const header = Buffer.alloc(4);
    header.writeUInt32LE(NATIVE_HOST_MAX_REQUEST_BYTES + 1, 0);
    pipes.stdin.write(header);

    const [response] = await pipes.waitForFrames(1);
    await finished;

    expect(response).toMatchObject({ code: 'invalid_request', requestId: null, type: 'failed' });
  });

  it('reports input that ends inside a frame', async () => {
    const { finished, pipes } = await startHost({});
    const header = Buffer.alloc(4);
    header.writeUInt32LE(100, 0);
    pipes.stdin.write(Buffer.concat([header, Buffer.from('{"a"')]));
    pipes.stdin.end();

    const [response] = await pipes.waitForFrames(1);
    await finished;

    expect(response).toMatchObject({ code: 'invalid_request', type: 'failed' });
  });

  it('stops the running provider when the browser closes the pipe', async () => {
    const { bin, finished, pipes, record } = await startHost({});
    await writeExecutable(
      bin,
      'claude',
      `cat > /dev/null\necho $$ > "$FAKE_RECORD/leader"\nsleep 60`
    );

    pipes.send(refineRequest());
    for (let attempt = 0; attempt < 200; attempt += 1) {
      if (
        await readFile(path.join(record, 'leader'), 'utf8').then(
          () => true,
          () => false
        )
      )
        break;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    pipes.stdin.end();
    await finished;

    const leader = Number((await readFile(path.join(record, 'leader'), 'utf8')).trim());
    expect(() => process.kill(leader, 0)).toThrow();
  });
});
