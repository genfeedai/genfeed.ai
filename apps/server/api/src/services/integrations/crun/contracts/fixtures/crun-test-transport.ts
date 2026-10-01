import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

/** Keyless loopback provider fixture. Production's fixed origin is rewritten only by the test seam. */
export async function createCrunTestTransport() {
  const nativeFetch = globalThis.fetch;
  const requests: { route: string; method: string; input: unknown }[] = [];
  let taskCount = 0;
  let base = '';
  const mediaOrigin = 'https://crun-fixture.invalid';
  let mediaAvailable = true;
  const pixel = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWFUAAAAASUVORK5CYII=',
    'base64',
  );
  let onCreate: (() => void) | undefined;
  let outcomes: ('success' | 'failed' | 'refused' | 'ambiguous')[] = [];
  const tasks = new Map<
    string,
    { model: string; credits: number; status: 'success' | 'failed' }
  >();
  const server = createServer(async (request, response) => {
    const url = new URL(request.url ?? '/', base);
    if (url.pathname.startsWith('/media/')) {
      response.writeHead(mediaAvailable ? 200 : 404, {
        'Content-Type': 'image/png',
      });
      response.end(mediaAvailable ? pixel : undefined);
      return;
    }
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const body: unknown = chunks.length
      ? JSON.parse(Buffer.concat(chunks).toString())
      : undefined;
    requests.push({
      route: url.pathname,
      method: request.method ?? 'GET',
      input: body,
    });
    const input = body as
      | { model?: string; input?: { resolution?: string } }
      | undefined;
    const credits =
      input?.model === 'bytedance/seedream-4-5'
        ? 6
        : input?.input?.resolution === '4K'
          ? 10
          : 8;
    let data: unknown;
    if (url.pathname.endsWith('/estimate-credits'))
      data = { credits, estimated: false };
    else if (url.pathname.endsWith('/CreateTask')) {
      const outcome = outcomes.shift() ?? 'success';
      onCreate?.();
      if (outcome === 'refused' || outcome === 'ambiguous') {
        response.writeHead(outcome === 'refused' ? 422 : 503, {
          'Content-Type': 'application/json',
        });
        response.end(
          JSON.stringify({
            code: outcome === 'refused' ? 422 : 503,
            message: 'fixture refusal',
          }),
        );
        return;
      }
      const taskId = `fixture-task-${++taskCount}`;
      tasks.set(taskId, {
        model: input?.model ?? '',
        credits,
        status: outcome,
      });
      data = { task_id: taskId };
    } else if (url.pathname.endsWith('/TaskInfo')) {
      const taskId = url.searchParams.get('task_id') ?? '';
      const task = tasks.get(taskId);
      if (!task) {
        response.writeHead(404);
        response.end('{}');
        return;
      }
      data = {
        task_id: taskId,
        provider: task.model.split('/')[0],
        model_version: 'fixture',
        status: task.status,
        credits: task.credits,
        param: {},
        source: 'api',
        create_at: 1,
        complete_at: 2,
        duration_s: 1,
        result: {
          code: 200,
          media_urls:
            task.status === 'success'
              ? [`${mediaOrigin}/media/${taskId}.png`]
              : [],
        },
      };
    } else {
      response.writeHead(404);
      response.end('{}');
      return;
    }
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ code: 200, message: 'fixture', data }));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const fetchFixture: typeof fetch = ((
    input: string | URL | Request,
    init?: RequestInit,
  ) => {
    const requested =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
    const target =
      requested.startsWith('https://api.crun.ai/') ||
      new URL(requested).origin === mediaOrigin
        ? `${base}${new URL(requested).pathname}${new URL(requested).search}`
        : requested;
    if (new URL(target).origin !== base)
      throw new Error('Fixture forbids non-owned network requests');
    return nativeFetch(target, init);
  }) as typeof fetch;
  return {
    fetch: fetchFixture,
    requests,
    pixel,
    base,
    mediaOrigin,
    setOnCreate: (callback?: () => void) => {
      onCreate = callback;
    },
    setOutcomes: (next: typeof outcomes) => {
      outcomes = [...next];
    },
    restoreMedia: () => {
      mediaAvailable = true;
    },
    expireMedia: () => {
      mediaAvailable = false;
    },
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  };
}
