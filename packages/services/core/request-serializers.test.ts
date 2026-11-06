import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import {
  collectionDocument,
  resourceDocument,
} from '@services/__mocks__/http.mock';
import { installFakeHttpRoutes } from '@services/__mocks__/http-routes.fake';
import ts from 'typescript';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@services/core/logger.service', () => ({
  logger: {
    debug: () => undefined,
    error: () => undefined,
    info: () => undefined,
    warn: () => undefined,
  },
}));

/** How often the deferred serializer runtime was imported. */
const runtime = { loads: 0 };

/** Replaces the runtime module with `factory`, counting each import. */
function deferRuntime(factory: () => object | Promise<object>) {
  runtime.loads = 0;
  vi.doMock('./request-serializers.runtime', () => {
    runtime.loads += 1;
    return factory();
  });
}

const passThrough = {
  TagSerializer: { serialize: (body: unknown) => ({ data: body }) },
};

async function tagsService() {
  const { TagsService } = await import('@services/content/tags.service');
  const service = new TagsService('deferred-token');
  const http = installFakeHttpRoutes(service, {
    'GET library': collectionDocument([{ id: 'tag-1', label: 'Existing' }]),
    'PATCH tag-1': resourceDocument({ label: 'Saved' }),
    'PATCH tag-2': resourceDocument({ label: 'Saved' }),
    'PATCH tag-3': resourceDocument({ label: 'Saved' }),
    'POST ': resourceDocument({ label: 'New' }),
  });
  return { http, service };
}

afterEach(() => {
  vi.doUnmock('./request-serializers.runtime');
  vi.resetModules();
});

describe('deferred request serializers', () => {
  it('keeps service construction, reads and ordinary DTO writes independent of the runtime', async () => {
    deferRuntime(() => passThrough);
    const { http, service } = await tagsService();

    expect((await service.findLibraryTags())[0].label).toBe('Existing');
    await service.post({ id: 'excluded', label: 'New' });

    expect(http.bodies).toEqual({
      'GET library': [undefined],
      'POST ': [{ label: 'New' }],
    });
    expect(runtime.loads).toBe(0);
  });

  it('deduplicates concurrent first writes, waits before HTTP and reuses the loaded module', async () => {
    let openGate: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      openGate = resolve;
    });
    deferRuntime(async () => {
      await gate;
      return passThrough;
    });
    const { http, service } = await tagsService();

    const first = service.updateTag('tag-1', 'First');
    const second = service.updateTag('tag-2', 'Second');
    await vi.waitFor(() => expect(runtime.loads).toBe(1));
    expect(http.bodies).toEqual({});
    openGate?.();
    await Promise.all([first, second]);
    await service.updateTag('tag-3', 'Third');

    expect(runtime.loads).toBe(1);
    expect(http.bodies).toEqual({
      'PATCH tag-1': [{ data: { label: 'First' } }],
      'PATCH tag-2': [{ data: { label: 'Second' } }],
      'PATCH tag-3': [{ data: { label: 'Third' } }],
    });
  });

  it('fails before sending HTTP when loading fails and retries on the next write', async () => {
    const offline = new Error('Failed to fetch dynamically imported module');
    let isOffline = true;
    deferRuntime(() => {
      if (isOffline) {
        isOffline = false;
        return Promise.reject(offline);
      }
      return passThrough;
    });
    const { http, service } = await tagsService();

    // Vitest wraps a rejected module factory and retains the load error as its cause.
    await expect(service.updateTag('tag-1', 'Offline')).rejects.toMatchObject({
      cause: offline,
    });
    expect(http.bodies).toEqual({});
    await service.updateTag('tag-1', 'Online');

    expect(runtime.loads).toBe(2);
    expect(http.bodies).toEqual({
      'PATCH tag-1': [{ data: { label: 'Online' } }],
    });
  });

  it('preserves serializer errors and keeps a successfully loaded runtime available', async () => {
    const invalid = new Error('Invalid input');
    deferRuntime(() => ({
      TagSerializer: {
        serialize: (body: { label: string }) => {
          if (body.label === 'Invalid') throw invalid;
          return { data: body };
        },
      },
    }));
    const { http, service } = await tagsService();

    await expect(service.updateTag('tag-1', 'Invalid')).rejects.toBe(invalid);
    expect(http.bodies).toEqual({});
    await service.updateTag('tag-1', 'Valid');

    expect(runtime.loads).toBe(1);
    expect(http.bodies).toEqual({
      'PATCH tag-1': [{ data: { label: 'Valid' } }],
    });
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
