import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runCheckServerPackageBoundary } from './check-server-package-boundary';

describe('check-server-package-boundary', () => {
  let testDir = '';

  beforeEach(() => {
    testDir = mkdtempSync(path.join(tmpdir(), 'server-package-boundary-'));
    writeFixture(
      'apps/server/server/package.json',
      JSON.stringify({ name: '@genfeedai/server' }),
    );
  });

  afterEach(() => {
    rmSync(testDir, { force: true, recursive: true });
  });

  it('flags API aliases and @genfeedai/api imports', () => {
    writeFixture(
      'apps/server/server/src/aliases.ts',
      `
        import { One } from '@api/collections/one';
        export { Two } from '@api-root/two';
        import type { Three } from '@api-test/three';
        import { Four } from '@genfeedai/api/four';
        import { BillingProviders } from '@billing-providers';
      `,
    );

    const result = runCheckServerPackageBoundary({ rootDir: testDir });

    expect(result.violations.map((violation) => violation.specifier)).toEqual([
      '@api/collections/one',
      '@api-root/two',
      '@api-test/three',
      '@genfeedai/api/four',
      '@billing-providers',
    ]);
  });

  it('flags dynamic imports, import types, require, and relative API reaches', () => {
    writeFixture(
      'apps/server/server/src/nested/coupled.ts',
      `
        type ApiType = import('@api/types/value').ApiType;
        const dynamicValue = import('@api/services/value');
        const requiredValue = require('@api/helpers/value');
        import { RelativeValue } from '../../../api/src/collections/value';
        import { ApiTest } from '../../../api/test/value';
        import { ApiScript } from '../../../api/scripts/value';
        import apiPackage from '../../../api/package.json';
        export { ApiScript, ApiTest, ApiType, apiPackage, dynamicValue, requiredValue, RelativeValue };
      `,
    );

    const result = runCheckServerPackageBoundary({ rootDir: testDir });

    expect(result.violations.map((violation) => violation.specifier)).toEqual([
      '@api/types/value',
      '@api/services/value',
      '@api/helpers/value',
      '../../../api/src/collections/value',
      '../../../api/test/value',
      '../../../api/scripts/value',
      '../../../api/package.json',
    ]);
  });

  it('scans specs and allows shared, server, Nest, libs, and api-types imports', () => {
    writeFixture(
      'apps/server/server/src/service.spec.ts',
      `
        import { Controller } from '@nestjs/common';
        import { QueueNames } from '@genfeedai/queue-contracts';
        import type { ApiSchema } from '@api-types/schema';
        import { LoggerService } from '@libs/logger/logger.service';
        import { SERVER_TOKENS } from '@server/server.dependencies';
        import { LocalValue } from './local';
        export { ApiSchema, Controller, LocalValue, LoggerService, QueueNames, SERVER_TOKENS };
      `,
    );

    const result = runCheckServerPackageBoundary({ rootDir: testDir });

    expect(result.scannedFileCount).toBe(1);
    expect(result.violations).toEqual([]);
  });

  it('flags an API package dependency in the server manifest', () => {
    writeFixture(
      'apps/server/server/package.json',
      JSON.stringify({
        dependencies: { '@genfeedai/api': 'workspace:*' },
        name: '@genfeedai/server',
      }),
    );

    const result = runCheckServerPackageBoundary({ rootDir: testDir });

    expect(result.violations).toEqual([
      expect.objectContaining({
        file: 'apps/server/server/package.json',
        specifier: '@genfeedai/api',
      }),
    ]);
  });

  function writeFixture(relativePath: string, contents: string): void {
    const absolutePath = path.join(testDir, relativePath);
    mkdirSync(path.dirname(absolutePath), { recursive: true });
    writeFileSync(absolutePath, contents);
  }
});
