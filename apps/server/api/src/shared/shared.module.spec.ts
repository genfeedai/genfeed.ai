import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { DEFAULT_HTTP_TIMEOUT_MS } from '@api/constants/http-timeout.constant';
import { SharedModule } from '@api/shared/shared.module';
import { HttpModule, HttpService } from '@nestjs/axios';
import type { DynamicModule } from '@nestjs/common';
import { Test } from '@nestjs/testing';

const SRC_ROOT = join(__dirname, '..');

function moduleFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      return entry === 'node_modules' ? [] : moduleFiles(path);
    }
    return path.endsWith('.module.ts') ? [path] : [];
  });
}

describe('SharedModule', () => {
  it('should be defined', () => {
    expect(SharedModule).toBeDefined();
  });

  it('registers its HTTP client with the default timeout', async () => {
    const imports: unknown[] = Reflect.getMetadata('imports', SharedModule);
    const httpModule = imports.find(
      (entry): entry is DynamicModule =>
        typeof entry === 'object' &&
        entry !== null &&
        (entry as DynamicModule).module === HttpModule,
    );
    expect(httpModule).toBeDefined();

    const testing = await Test.createTestingModule({
      imports: [httpModule as DynamicModule],
    }).compile();

    expect(testing.get(HttpService).axiosRef.defaults.timeout).toBe(
      DEFAULT_HTTP_TIMEOUT_MS,
    );
  });

  it('leaves no module importing HttpModule without a timeout', () => {
    const bare = moduleFiles(SRC_ROOT).filter((file) =>
      readFileSync(file, 'utf8')
        .split('\n')
        .some(
          (line) =>
            !line.startsWith('import ') &&
            /\bHttpModule\b(?!\.register)(?![A-Za-z])/.test(line) &&
            !line.includes('export class'),
        ),
    );

    expect(bare).toEqual([]);
  });
});
