import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runCheckDiValueImports } from './check-di-value-imports';

describe('check-di-value-imports', () => {
  let originalCwd = '';
  let testDir = '';

  beforeEach(() => {
    originalCwd = process.cwd();
    testDir = mkdtempSync(path.join(tmpdir(), 'di-value-import-check-'));
    process.chdir(testDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    rmSync(testDir, { force: true, recursive: true });
  });

  it('flags non-leading named type-only imports used by constructor metadata', () => {
    writeFixture(
      'apps/server/api/src/demo/demo.controller.ts',
      [
        "import { Injectable, type DemoService } from './demo.service';",
        '',
        '@Injectable()',
        'export class DemoController {',
        '  constructor(private readonly demoService: DemoService) {}',
        '}',
      ].join('\n'),
    );

    const result = runCheckDiValueImports();

    expect(result.violations).toEqual([
      expect.objectContaining({
        context: 'constructor',
        owner: 'DemoController',
        typeName: 'DemoService',
      }),
    ]);
  });

  it('flags non-leading named type-only DTO imports used by route metadata', () => {
    writeFixture(
      'apps/server/api/src/demo/demo.controller.ts',
      [
        "import { Body, Controller, Post, type CreateDemoDto } from '@nestjs/common';",
        '',
        '@Controller()',
        'export class DemoController {',
        '  @Post()',
        '  create(@Body() body: CreateDemoDto): void {',
        '    void body;',
        '  }',
        '}',
      ].join('\n'),
    );

    const result = runCheckDiValueImports();

    expect(result.violations).toEqual([
      expect.objectContaining({
        context: 'decorated-parameter',
        owner: 'DemoController.create',
        typeName: 'CreateDemoDto',
      }),
    ]);
  });

  it('allows type-only constructor params with an explicit injection token', () => {
    writeFixture(
      'apps/server/api/src/demo/demo.service.ts',
      [
        "import { Inject, Injectable, type DemoPort } from './demo.port';",
        '',
        '@Injectable()',
        'export class DemoService {',
        "  constructor(@Inject('DEMO_PORT') private readonly port: DemoPort) {}",
        '}',
      ].join('\n'),
    );

    const result = runCheckDiValueImports();

    expect(result.violations).toHaveLength(0);
  });
});

function writeFixture(relativePath: string, content: string): void {
  const filePath = path.join(process.cwd(), relativePath);
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, content, 'utf8');
}
