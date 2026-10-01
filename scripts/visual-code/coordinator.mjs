import { spawn } from 'node:child_process';
import { createHash, timingSafeEqual } from 'node:crypto';
import {
  mkdir,
  readdir,
  readFile,
  rename,
  stat,
  writeFile,
} from 'node:fs/promises';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DEADLINE_MS,
  decodeFrame,
  encodeFrame,
  inputHash,
  invariant,
  MAX_BYTES,
  validateInput,
  validateResult,
} from './protocol.mjs';

const IMAGE = 'genfeed-visual-code:4.0.530';
const CAPACITY = 16 * 1024 ** 3;
export function containerName(id) {
  return `visual-code-${createHash('sha256').update(id).digest('hex').slice(0, 40)}`;
}
export function dockerArguments(id) {
  return [
    'run',
    '--name',
    containerName(id),
    '--runtime=runsc',
    '--network=none',
    '--user=65532:65532',
    '--read-only',
    '--cap-drop=ALL',
    '--security-opt=no-new-privileges',
    '--cpus=2',
    '--memory=2g',
    '--memory-swap=2g',
    '--pids-limit=256',
    '--tmpfs=/tmp:rw,nosuid,nodev,size=1073741824,mode=1777',
    '--shm-size=256m',
    '--entrypoint=node',
    '-i',
    IMAGE,
    '/runtime/runner.mjs',
  ];
}
async function command(
  binary,
  args,
  { input, limit = MAX_BYTES + 4, signal = AbortSignal.timeout(10_000) } = {},
) {
  return new Promise((accept, reject) => {
    const child = spawn(binary, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      signal,
    });
    const chunks = [];
    let length = 0;
    let error;
    child.on('error', reject);
    child.stdin.on('error', () => {});
    child.stderr.on('data', () => {});
    child.stdout.on('data', (chunk) => {
      length += chunk.length;
      if (length > limit) {
        error = new Error('subprocess_output_limit');
        child.kill('SIGKILL');
      } else chunks.push(chunk);
    });
    child.on('close', (code) =>
      error ? reject(error) : accept({ code, bytes: Buffer.concat(chunks) }),
    );
    child.stdin.end(input);
  });
}
async function atomic(path, value) {
  const temporary = `${path}.pending`;
  await writeFile(temporary, value, { mode: 0o600, flush: true });
  await rename(temporary, path);
}
export async function verifyVideo(
  media,
  input,
  signal = new AbortController().signal,
) {
  signal.throwIfAborted();
  if (media.format !== 'mp4') return;
  const probe = await command(
    'ffprobe',
    [
      '-v',
      'error',
      '-protocol_whitelist',
      'pipe',
      '-i',
      'pipe:0',
      '-show_entries',
      'stream=width,height,codec_name,codec_type,r_frame_rate,duration:format=duration',
      '-of',
      'json',
    ],
    {
      input: Buffer.from(media.bytes, 'base64'),
      limit: 8192,
      signal: AbortSignal.any([signal, AbortSignal.timeout(10_000)]),
    },
  );
  invariant(probe.code === 0, 'video_probe_failed');
  signal.throwIfAborted();
  const info = JSON.parse(probe.bytes.toString());
  const stream = info.streams?.find((item) => item.codec_type === 'video');
  invariant(
    stream?.width === input.settings.width &&
      stream?.height === input.settings.height &&
      stream?.codec_name === 'h264',
    'invalid_video_dimensions_or_codec',
  );
  const [numerator, denominator] = String(stream.r_frame_rate)
    .split('/')
    .map(Number);
  invariant(
    Number.isFinite(numerator / denominator) &&
      Math.abs(numerator / denominator - input.settings.fps) < 0.01,
    'invalid_video_fps',
  );
  const duration = Number(stream.duration ?? info.format?.duration);
  invariant(
    Number.isFinite(duration) &&
      Math.abs(duration - input.settings.durationFrames / input.settings.fps) <=
        1 / input.settings.fps + 0.001,
    'invalid_video_duration',
  );
  invariant(
    info.streams
      .filter((item) => item.codec_type === 'audio')
      .every((item) => item.codec_name === 'aac'),
    'invalid_audio_codec',
  );
  return info;
}

export class Coordinator {
  constructor(directory) {
    this.directory = directory;
    this.jobs = new Map();
    this.running = new Map();
    this.admissions = Promise.resolve();
    this.isReady = false;
  }
  manifest(id) {
    return resolve(this.directory, `${containerName(id)}.json`);
  }
  resultPath(id) {
    return resolve(this.directory, `${containerName(id)}.result`);
  }
  async persist(receipt) {
    await atomic(this.manifest(receipt.id), JSON.stringify(receipt));
    this.jobs.set(receipt.id, receipt);
  }
  async removeContainer(id) {
    const result = await command(
      'docker',
      ['rm', '--force', containerName(id)],
      { limit: 8192 },
    );
    if (result.code !== 0) {
      const check = await command(
        'docker',
        [
          'container',
          'ls',
          '--all',
          '--filter',
          `name=^/${containerName(id)}$`,
          '--format',
          '{{.ID}}',
        ],
        { limit: 8192 },
      );
      invariant(
        check.code === 0 && check.bytes.toString().trim() === '',
        'container_cleanup_failed',
      );
    }
  }
  async initialize() {
    const info = await command(
      'docker',
      [
        'info',
        '--format',
        '{{if index .Runtimes "runsc"}}true{{else}}false{{end}}',
      ],
      { limit: 8192 },
    );
    invariant(
      info.code === 0 && JSON.parse(info.bytes.toString()) === true,
      'runsc_unavailable',
    );
    invariant(
      (
        await command('docker', ['image', 'inspect', IMAGE], {
          limit: 64 * 1024,
        })
      ).code === 0,
      'renderer_image_unavailable',
    );
    invariant(
      (await command('runsc', ['--version'], { limit: 8192 })).code === 0,
      'runsc_unavailable',
    );
    invariant(
      (await command('ffprobe', ['-version'], { limit: 8192 })).code === 0,
      'ffprobe_unavailable',
    );
    for (const filename of await readdir(this.directory)) {
      if (!/^visual-code-[a-f0-9]{40}\.json$/.test(filename)) continue;
      const receipt = JSON.parse(
        await readFile(resolve(this.directory, filename), 'utf8'),
      );
      invariant(
        this.manifest(receipt.id) === resolve(this.directory, filename),
        'invalid_state',
      );
      if (receipt.status === 'running') {
        await this.removeContainer(receipt.id);
        await this.persist({
          ...receipt,
          status: 'failed',
          diagnostic: 'renderer_call_indeterminate',
          computeSeconds: 0,
          isComputeIndeterminate: true,
          finishedAt: Date.now(),
        });
      } else this.jobs.set(receipt.id, receipt);
    }
    this.isReady = true;
  }
  submit(value) {
    const admission = this.admissions.then(async () => {
      invariant(this.isReady, 'renderer_unavailable');
      const input = validateInput(value);
      const hash = inputHash(input);
      const existing = this.jobs.get(input.id);
      if (existing) {
        invariant(existing.inputHash === hash, 'idempotency_conflict');
        return existing;
      }
      invariant(this.running.size < 2, 'renderer_busy');
      let used = this.running.size * (MAX_BYTES + 8192);
      for (const filename of await readdir(this.directory))
        used += (await stat(resolve(this.directory, filename))).size;
      invariant(
        used + MAX_BYTES + 8192 <= CAPACITY,
        'state_capacity_exhausted',
      );
      const receipt = {
        id: input.id,
        inputHash: hash,
        sourceHash: createHash('sha256').update(input.sourceCode).digest('hex'),
        status: 'running',
        startedAt: Date.now(),
        computeSeconds: 0,
      };
      await this.persist(receipt);
      const controller = new AbortController();
      this.running.set(input.id, controller);
      void this.execute(input, receipt, controller).catch(() => {
        this.isReady = false;
      });
      return receipt;
    });
    this.admissions = admission.catch(() => {});
    return admission;
  }
  async execute(input, receipt, controller) {
    const started = performance.now();
    const timer = setTimeout(() => controller.abort(), DEADLINE_MS);
    let outcome;
    let diagnostic;
    try {
      const processResult = await command('docker', dockerArguments(input.id), {
        input: encodeFrame(input),
        signal: controller.signal,
      });
      controller.signal.throwIfAborted();
      const result = validateResult(decodeFrame(processResult.bytes), input);
      invariant(
        processResult.code === 0 || result.diagnostics.length > 0,
        'renderer_exit_failure',
      );
      for (const media of result.media)
        await verifyVideo(media, input, controller.signal);
      controller.signal.throwIfAborted();
      await atomic(this.resultPath(input.id), encodeFrame(result));
      controller.signal.throwIfAborted();
      outcome = result.diagnostics.length ? 'failed' : 'completed';
      diagnostic = result.diagnostics.length ? 'render_failed' : undefined;
    } catch (error) {
      outcome = controller.signal.aborted ? 'cancelled' : 'failed';
      diagnostic = controller.signal.aborted
        ? 'cancelled_or_deadline'
        : error instanceof Error && /^[a-z_]+$/.test(error.message)
          ? error.message
          : 'renderer_output_invalid';
    } finally {
      clearTimeout(timer);
      await this.removeContainer(input.id);
      const final = {
        ...receipt,
        status: outcome,
        diagnostic,
        finishedAt: Date.now(),
        computeSeconds: (performance.now() - started) / 1000,
      };
      await this.persist(final);
      this.running.delete(input.id);
    }
  }
  async cancel(id) {
    this.running.get(id)?.abort();
    return this.jobs.get(id);
  }
}
export function authorized(header, token) {
  const expected = Buffer.from(`Bearer ${token}`);
  const actual = Buffer.from(header ?? '');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
async function main() {
  invariant(process.platform === 'linux', 'linux_required');
  const directory = process.env.VISUAL_CODE_STATE_DIR;
  const token = process.env.VISUAL_CODE_RENDERER_TOKEN;
  invariant(
    directory?.startsWith('/') && token && token.length >= 32,
    'renderer_configuration_required',
  );
  await mkdir(directory, { recursive: true, mode: 0o700 });
  invariant(
    ((await stat(directory)).mode & 0o777) === 0o700,
    'private_state_required',
  );
  if (process.argv[2] !== '--state-lock-held') {
    const child = spawn(
      'flock',
      [
        '--exclusive',
        '--nonblock',
        resolve(directory, 'coordinator.lock'),
        process.execPath,
        fileURLToPath(import.meta.url),
        '--state-lock-held',
      ],
      { stdio: 'inherit' },
    );
    child.on('error', () => {
      process.exitCode = 1;
    });
    child.on('exit', (code) => {
      process.exitCode = code ?? 1;
    });
    for (const signal of ['SIGINT', 'SIGTERM'])
      process.on(signal, () => child.kill(signal));
    return;
  }
  const coordinator = new Coordinator(directory);
  await coordinator.initialize();
  const server = createServer(async (req, res) => {
    const json = (status, value) => {
      res.writeHead(status, {
        'content-type': 'application/json',
        'cache-control': 'no-store',
      });
      res.end(JSON.stringify(value));
    };
    if (!authorized(req.headers.authorization, token))
      return json(401, { error: 'unauthorized' });
    try {
      const url = new URL(req.url, 'http://127.0.0.1');
      if (req.method === 'GET' && url.pathname === '/health')
        return json(coordinator.isReady ? 200 : 503, {
          isReady: coordinator.isReady,
          rendererVersion: '4.0.530',
        });
      if (req.method === 'POST' && url.pathname === '/jobs') {
        let length = 0;
        const chunks = [];
        for await (const chunk of req) {
          length += chunk.length;
          invariant(length <= MAX_BYTES, 'input_too_large');
          chunks.push(chunk);
        }
        return json(
          202,
          await coordinator.submit(
            JSON.parse(Buffer.concat(chunks).toString()),
          ),
        );
      }
      const match =
        /^\/jobs\/([a-zA-Z0-9_-]{1,200})(?:\/(cancel|result))?$/.exec(
          url.pathname,
        );
      if (!match) return json(404, { error: 'not_found' });
      const receipt = coordinator.jobs.get(match[1]);
      if (!receipt) return json(404, { error: 'not_found' });
      if (req.method === 'POST' && match[2] === 'cancel')
        return json(202, await coordinator.cancel(match[1]));
      if (req.method === 'GET' && !match[2]) return json(200, receipt);
      if (
        req.method === 'GET' &&
        match[2] === 'result' &&
        ['completed', 'failed'].includes(receipt.status)
      ) {
        const result = await readFile(coordinator.resultPath(receipt.id));
        res.writeHead(200, {
          'content-type': 'application/octet-stream',
          'cache-control': 'no-store',
        });
        res.end(result);
        return;
      }
      return json(409, { error: 'result_unavailable' });
    } catch (error) {
      const code = error instanceof Error ? error.message : 'invalid_request';
      return json(
        code === 'idempotency_conflict'
          ? 409
          : code === 'renderer_busy'
            ? 503
            : 400,
        {
          error: /^[a-z_]+$/.test(code) ? code : 'invalid_request',
        },
      );
    }
  });
  server.requestTimeout = DEADLINE_MS;
  server.listen(8789, '127.0.0.1');
  for (const signal of ['SIGINT', 'SIGTERM'])
    process.on(signal, () => {
      coordinator.isReady = false;
      server.close();
      for (const controller of coordinator.running.values()) controller.abort();
    });
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  main().catch(() => {
    process.stderr.write(
      'Visual renderer is unavailable; check runtime and private state configuration.\n',
    );
    process.exitCode = 1;
  });
