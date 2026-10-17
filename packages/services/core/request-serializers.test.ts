import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import {
  axiosResponse,
  collectionDocument,
  installMockHttp,
  resourceDocument,
} from '@services/__mocks__/http.mock';
import ts from 'typescript';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@services/core/logger.service', () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

afterEach(() => {
  vi.doUnmock('./request-serializers.runtime');
  vi.resetModules();
  vi.clearAllMocks();
});

describe('deferred request serializers', () => {
  it('keeps service construction, reads and ordinary DTO writes independent of the runtime', async () => {
    const load = vi.fn(() => ({ TagSerializer: { serialize: vi.fn() } }));
    vi.doMock('./request-serializers.runtime', load);
    const { TagsService } = await import('@services/content/tags.service');
    const service = new TagsService('deferred-token');
    const http = installMockHttp(service);
    http.get.mockResolvedValue(
      axiosResponse(collectionDocument([{ id: 'tag-1', label: 'Existing' }])),
    );
    http.post.mockResolvedValue(
      axiosResponse(resourceDocument({ label: 'New' })),
    );

    expect((await service.findLibraryTags())[0].label).toBe('Existing');
    await service.post({ id: 'excluded', label: 'New' });

    expect(http.post).toHaveBeenCalledWith('', { label: 'New' });
    expect(load).not.toHaveBeenCalled();
  });

  it('deduplicates concurrent first writes, waits before HTTP and reuses the loaded module', async () => {
    let resolveLoad: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      resolveLoad = resolve;
    });
    const serialize = vi.fn((body: unknown) => ({ data: body }));
    const load = vi.fn(async () => {
      await gate;
      return { TagSerializer: { serialize } };
    });
    vi.doMock('./request-serializers.runtime', load);
    const { TagsService } = await import('@services/content/tags.service');
    const service = new TagsService('deferred-token');
    const http = installMockHttp(service);
    http.patch.mockResolvedValue(
      axiosResponse(resourceDocument({ label: 'Saved' })),
    );

    const first = service.updateTag('tag-1', 'First');
    const second = service.updateTag('tag-2', 'Second');
    await vi.waitFor(() => expect(load).toHaveBeenCalledOnce());
    expect(http.patch).not.toHaveBeenCalled();
    resolveLoad?.();
    await Promise.all([first, second]);
    await service.updateTag('tag-3', 'Third');

    expect(load).toHaveBeenCalledOnce();
    expect(http.patch).toHaveBeenNthCalledWith(1, 'tag-1', {
      data: { label: 'First' },
    });
    expect(http.patch).toHaveBeenNthCalledWith(2, 'tag-2', {
      data: { label: 'Second' },
    });
    expect(http.patch).toHaveBeenNthCalledWith(3, 'tag-3', {
      data: { label: 'Third' },
    });
  });

  it('fails before sending HTTP when loading fails and retries on the next write', async () => {
    const offline = new Error('Failed to fetch dynamically imported module');
    const load = vi
      .fn()
      .mockRejectedValueOnce(offline)
      .mockResolvedValue({
        TagSerializer: { serialize: (body: unknown) => ({ data: body }) },
      });
    vi.doMock('./request-serializers.runtime', load);
    const { TagsService } = await import('@services/content/tags.service');
    const service = new TagsService('deferred-token');
    const http = installMockHttp(service);
    http.patch.mockResolvedValue(
      axiosResponse(resourceDocument({ label: 'Saved' })),
    );

    // Vitest wraps a rejected module factory and retains the load error as its cause.
    await expect(service.updateTag('tag-1', 'Offline')).rejects.toMatchObject({
      cause: offline,
    });
    expect(http.patch).not.toHaveBeenCalled();
    await service.updateTag('tag-1', 'Online');

    expect(load).toHaveBeenCalledTimes(2);
    expect(http.patch).toHaveBeenCalledOnce();
    expect(http.patch).toHaveBeenCalledWith('tag-1', {
      data: { label: 'Online' },
    });
  });

  it('preserves serializer errors and keeps a successfully loaded runtime available', async () => {
    const invalid = new Error('Invalid input');
    const serialize = vi
      .fn()
      .mockImplementationOnce(() => {
        throw invalid;
      })
      .mockImplementation((body: unknown) => ({ data: body }));
    const load = vi.fn(() => ({ TagSerializer: { serialize } }));
    vi.doMock('./request-serializers.runtime', load);
    const { TagsService } = await import('@services/content/tags.service');
    const service = new TagsService('deferred-token');
    const http = installMockHttp(service);
    http.patch.mockResolvedValue(
      axiosResponse(resourceDocument({ label: 'Saved' })),
    );

    await expect(service.updateTag('tag-1', 'Invalid')).rejects.toBe(invalid);
    expect(http.patch).not.toHaveBeenCalled();
    await service.updateTag('tag-1', 'Valid');

    expect(load).toHaveBeenCalledOnce();
    expect(http.patch).toHaveBeenCalledOnce();
  });
});

it('keeps canonical serializers behind the single deferred runtime boundary', () => {
  const root = path.resolve(__dirname, '..');
  const eager: string[] = [];
  function visit(directory: string): void {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name.startsWith('__'))
        continue;
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        visit(file);
        continue;
      }
      if (
        !entry.name.endsWith('.ts') ||
        /\.(test|spec)\.ts$/.test(entry.name) ||
        entry.name.startsWith('vitest.')
      )
        continue;
      if (entry.name === 'request-serializers.runtime.ts') continue;
      const source = ts.createSourceFile(
        file,
        readFileSync(file, 'utf8'),
        ts.ScriptTarget.Latest,
        true,
      );
      function inspect(node: ts.Node): void {
        if (
          ts.isImportDeclaration(node) &&
          ts.isStringLiteral(node.moduleSpecifier)
        ) {
          const request = node.moduleSpecifier.text;
          const clause = node.importClause;
          const values =
            clause &&
            !clause.isTypeOnly &&
            (!clause.namedBindings ||
              !ts.isNamedImports(clause.namedBindings) ||
              clause.namedBindings.elements.some(
                (element) => !element.isTypeOnly,
              ));
          if (
            values &&
            /^(?:@genfeedai\/serializers|@serializers|ts-jsonapi|lodash)(?:\/|$)/.test(
              request,
            )
          )
            eager.push(path.relative(root, file));
        }
        if (
          ts.isExportDeclaration(node) &&
          !node.isTypeOnly &&
          node.moduleSpecifier &&
          ts.isStringLiteral(node.moduleSpecifier) &&
          /^(?:@genfeedai\/serializers|@serializers)(?:\/|$)/.test(
            node.moduleSpecifier.text,
          )
        )
          eager.push(path.relative(root, file));
        ts.forEachChild(node, inspect);
      }
      inspect(source);
    }
  }
  visit(root);
  expect([...new Set(eager)]).toEqual([]);
});
