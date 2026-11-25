import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { libraryCommand } from '../../src/commands/library';

const server = vi.hoisted(() => ({ baseUrl: '' }));

vi.mock('../../src/config/store', () => ({
  getApiKey: async () => 'gf_test_key',
  getApiUrl: async () => server.baseUrl,
  getAppUrl: async () => 'https://app.genfeed.test',
}));
vi.mock('../../src/utils/errors', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/utils/errors')>()),
  handleError: (error: unknown) => {
    throw error;
  },
}));

interface StoredAsset {
  bytes?: Buffer;
  category: string;
  folderId: string | null;
  id: string;
  label: string;
  mode: 'local' | 'signed';
  status: 'PROCESSING' | 'UPLOADED';
}

/** What the API and storage hold; each test reads it after the command ran. */
const library = {
  assets: new Map<string, StoredAsset>(),
  authorizedStorageCalls: 0,
  folders: new Set(['folder-1']),
  selfHosted: false,
};

const ACCEPTED_TYPES: Record<string, string> = {
  'image/png': 'images',
  'video/mp4': 'videos',
};

function resource(asset: StoredAsset) {
  return {
    attributes: {
      category: asset.category,
      folderId: asset.folderId,
      status: asset.status,
    },
    id: asset.id,
    type: 'ingredient',
  };
}

async function readBody(request: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
}

function reply(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify(body));
}

async function handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const url = new URL(request.url ?? '/', server.baseUrl);
  const method = request.method ?? 'GET';
  const body = await readBody(request);
  if (request.headers.authorization && url.pathname.startsWith('/storage')) {
    library.authorizedStorageCalls += 1;
  }

  if (method === 'GET' && url.pathname.startsWith('/folders/')) {
    const id = url.pathname.split('/')[2];
    if (!library.folders.has(id)) return reply(response, 404, { message: 'Folder not found' });
    return reply(response, 200, { data: { attributes: { label: 'Cuts' }, id, type: 'folder' } });
  }

  if (method === 'POST' && url.pathname === '/ingredients/upload/presigned') {
    const input = JSON.parse(body.toString()) as {
      category: string;
      contentType: string;
      filename: string;
      sizeBytes: number;
    };
    const folder = ACCEPTED_TYPES[input.contentType];
    if (!folder) {
      return reply(response, 415, {
        message: `Content type "${input.contentType}" is not allowed for ingredient uploads.`,
      });
    }
    const id = `asset-${library.assets.size + 1}`;
    library.assets.set(id, {
      category: folder === 'images' ? 'IMAGE' : 'VIDEO',
      folderId: null,
      id,
      label: input.filename,
      mode: library.selfHosted ? 'local' : 'signed',
      status: 'PROCESSING',
    });
    return reply(response, 200, {
      data: {
        attributes: {
          s3Key: `ingredients/${folder}/${id}`,
          uploadUrl: library.selfHosted
            ? `${server.baseUrl}/v1/files/upload`
            : `${server.baseUrl}/storage/${id}`,
        },
        id,
        type: 'presigned-upload',
      },
    });
  }

  if (method === 'PUT' && url.pathname.startsWith('/storage/')) {
    const asset = library.assets.get(url.pathname.split('/')[2]);
    if (!asset) return reply(response, 403, { message: 'Signature expired' });
    asset.bytes = body;
    return reply(response, 200, {});
  }

  if (method === 'POST' && url.pathname === '/v1/files/upload') {
    const input = JSON.parse(body.toString()) as {
      key: string;
      source: { data: string };
      type: string;
    };
    const asset = library.assets.get(input.key);
    if (!asset || !input.type) return reply(response, 400, { message: 'Bad upload' });
    asset.bytes = Buffer.from(input.source.data.split(',')[1], 'base64');
    return reply(response, 200, {});
  }

  if (method === 'POST' && url.pathname.startsWith('/ingredients/upload/confirm/')) {
    const asset = library.assets.get(url.pathname.split('/')[4]);
    if (!asset?.bytes) return reply(response, 400, { message: 'No bytes were uploaded' });
    asset.status = 'UPLOADED';
    return reply(response, 200, { data: resource(asset) });
  }

  if (method === 'PATCH' && url.pathname.startsWith('/ingredients/')) {
    const asset = library.assets.get(url.pathname.split('/')[2]);
    if (!asset) return reply(response, 404, { message: 'Not found' });
    asset.folderId = (JSON.parse(body.toString()) as { folderId: string }).folderId;
    return reply(response, 200, { data: resource(asset) });
  }

  if (method === 'GET' && url.pathname === '/ingredients/batch') {
    const asset = library.assets.get(url.searchParams.get('ids') ?? '');
    return reply(response, 200, { data: asset ? [resource(asset)] : [] });
  }

  return reply(response, 404, { message: `No route ${method} ${url.pathname}` });
}

describe('gf asset upload', () => {
  let http: Server;
  let dir: string;
  let output = '';

  async function run(...args: string[]): Promise<void> {
    await libraryCommand.parseAsync(['upload', ...args], { from: 'user' });
  }

  async function makeFile(name: string, content: string): Promise<string> {
    const path = join(dir, name);
    await writeFile(path, content);
    return path;
  }

  beforeAll(async () => {
    http = createServer((request, response) => {
      handle(request, response).catch((error) => reply(response, 500, { message: String(error) }));
    });
    await new Promise<void>((done) => http.listen(0, '127.0.0.1', done));
    server.baseUrl = `http://127.0.0.1:${(http.address() as AddressInfo).port}`;
    dir = await mkdtemp(join(tmpdir(), 'gf-upload-'));
  });

  afterAll(async () => {
    await new Promise((done) => http.close(done));
    await rm(dir, { force: true, recursive: true });
  });

  beforeEach(() => {
    library.assets.clear();
    library.authorizedStorageCalls = 0;
    library.selfHosted = false;
    output = '';
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      output += String(chunk);
      return true;
    });
  });

  it('stores the bytes, files the asset in the folder and prints what the Library holds', async () => {
    const clip = await makeFile('clip.mp4', 'video-bytes');

    await run(clip, '--folder', 'folder-1', '--json');

    const [result] = JSON.parse(output) as Array<{
      assetId: string;
      folderId: string;
      ok: boolean;
    }>;
    expect(result).toMatchObject({ assetId: 'asset-1', folderId: 'folder-1', ok: true });
    expect(library.assets.get('asset-1')).toMatchObject({
      category: 'VIDEO',
      folderId: 'folder-1',
      status: 'UPLOADED',
    });
    expect(library.assets.get('asset-1')?.bytes?.toString()).toBe('video-bytes');
    expect(library.authorizedStorageCalls).toBe(0);
  });

  it('prints the asset id and a Library link for a person', async () => {
    const still = await makeFile('still.png', 'png-bytes');

    await run(still, '--folder', 'folder-1');

    expect(output).toContain('Uploaded');
    expect(output).toContain('asset-1');
    expect(output).toContain('https://app.genfeed.test/library/assets?folder=folder-1');
  });

  it('uploads to a self-hosted server through the Files service', async () => {
    library.selfHosted = true;
    const still = await makeFile('local.png', 'local-bytes');

    await run(still, '--json');

    expect(library.assets.get('asset-1')?.bytes?.toString()).toBe('local-bytes');
    expect(library.assets.get('asset-1')?.status).toBe('UPLOADED');
    expect(library.assets.get('asset-1')?.folderId).toBeNull();
  });

  it('fails with the server message and a non-zero result when the type is refused', async () => {
    const notes = await makeFile('notes.pdf', '%PDF');

    await expect(run(notes, '--json')).rejects.toThrow('1 of 1 uploads failed');

    const [result] = JSON.parse(output) as Array<{ error: string; ok: boolean }>;
    expect(result.ok).toBe(false);
    expect(result.error).toContain('Content type "application/octet-stream" is not allowed');
    expect(library.assets.size).toBe(0);
  });

  it('reports every file and still fails when one of several uploads fails', async () => {
    const good = await makeFile('good.png', 'good');
    const bad = await makeFile('bad.pdf', 'bad');
    const missing = join(dir, 'missing.png');
    const last = await makeFile('last.mp4', 'last');

    await expect(run(good, bad, missing, last, '--json')).rejects.toThrow('2 of 4 uploads failed');

    const results = JSON.parse(output) as Array<{ assetId?: string; error?: string; ok: boolean }>;
    expect(results.map((result) => result.ok)).toEqual([true, false, false, true]);
    expect(results[2].error).toContain('Cannot read');
    expect([...library.assets.values()].map((asset) => asset.status)).toEqual([
      'UPLOADED',
      'UPLOADED',
    ]);
  });

  it('uploads nothing when the folder does not exist', async () => {
    const still = await makeFile('nofolder.png', 'png');

    await expect(run(still, '--folder', 'folder-gone', '--json')).rejects.toThrow('1 of 1');

    const [result] = JSON.parse(output) as Array<{ error: string }>;
    expect(result.error).toBe('Folder not found');
    expect(library.assets.size).toBe(0);
  });

  it('refuses a directory', async () => {
    await expect(run(dir, '--json')).rejects.toThrow('1 of 1 uploads failed');

    const [result] = JSON.parse(output) as Array<{ error: string }>;
    expect(result.error).toContain('is not a file');
  });
});
