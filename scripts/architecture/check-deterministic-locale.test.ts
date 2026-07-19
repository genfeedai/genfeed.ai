import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  type ImplicitLocaleAllowance,
  runCheckDeterministicLocale,
} from './check-deterministic-locale';

describe('check-deterministic-locale', () => {
  let testDir = '';

  beforeEach(() => {
    testDir = mkdtempSync(path.join(tmpdir(), 'deterministic-locale-'));
  });

  afterEach(() => {
    rmSync(testDir, { force: true, recursive: true });
  });

  it('rejects bare locale methods and Intl formatters', () => {
    writeFixture(
      'apps/website/app/pricing/page.tsx',
      [
        'export const values = [',
        '  (1000).toLocaleString(),',
        '  new Date().toLocaleDateString(),',
        '  new Date().toLocaleTimeString(),',
        '  new Intl.NumberFormat().format(1000),',
        '  Intl.DateTimeFormat().format(new Date()),',
        '  (1000).toLocaleString(undefined, { maximumFractionDigits: 0 }),',
        "  new Date().toLocaleDateString(undefined, { weekday: 'short' }),",
        "  new Date().toLocaleTimeString(undefined, { hour: '2-digit' }),",
        '  new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(1000),',
        "  Intl.DateTimeFormat(undefined, { weekday: 'short' }).format(new Date()),",
        '];',
      ].join('\n'),
    );

    const result = runCheckDeterministicLocale({
      allowances: [],
      rootDir: testDir,
    });

    expect(result.violations).toHaveLength(10);
    expect(result.occurrences.map(({ api }) => api)).toEqual([
      'to-locale-string',
      'to-locale-date-string',
      'to-locale-time-string',
      'intl-number-format',
      'intl-date-time-format',
      'to-locale-string',
      'to-locale-date-string',
      'to-locale-time-string',
      'intl-number-format',
      'intl-date-time-format',
    ]);
  });

  it('accepts explicit locales for method and constructor formatting', () => {
    writeFixture(
      'packages/pricing/src/format.ts',
      [
        "export const number = (1000).toLocaleString('en-US');",
        "export const date = new Date().toLocaleDateString('en-US');",
        "export const numberFormatter = new Intl.NumberFormat('en-US');",
        "export const dateFormatter = Intl.DateTimeFormat('en-US');",
      ].join('\n'),
    );

    const result = runCheckDeterministicLocale({
      allowances: [],
      rootDir: testDir,
    });

    expect(result.occurrences).toHaveLength(0);
    expect(result.violations).toHaveLength(0);
  });

  it('ratchets documented intentional formatting without allowing growth', () => {
    writeFixture(
      'packages/agent/src/components/ClientClock.tsx',
      [
        "'use client';",
        'export const first = new Date().toLocaleString();',
        'export const second = new Date().toLocaleString();',
      ].join('\n'),
    );
    const allowances: ImplicitLocaleAllowance[] = [
      {
        api: 'to-locale-string',
        count: 1,
        file: 'packages/agent/src/components/ClientClock.tsx',
        reason: 'Client-local clock display.',
      },
    ];

    const result = runCheckDeterministicLocale({
      allowances,
      rootDir: testDir,
    });

    expect(result.violations).toEqual([
      expect.objectContaining({ kind: 'implicit-locale' }),
    ]);
  });

  it('flags stale allowances when implicit formatting is removed', () => {
    writeFixture(
      'packages/agent/src/components/ClientClock.tsx',
      "export const value = new Date().toLocaleString('en-US');",
    );

    const result = runCheckDeterministicLocale({
      allowances: [
        {
          api: 'to-locale-string',
          count: 1,
          file: 'packages/agent/src/components/ClientClock.tsx',
          reason: 'Client-local clock display.',
        },
      ],
      rootDir: testDir,
    });

    expect(result.violations).toEqual([
      expect.objectContaining({ kind: 'stale-allowance' }),
    ]);
  });

  function writeFixture(relativePath: string, source: string): void {
    const absolutePath = path.join(testDir, relativePath);
    mkdirSync(path.dirname(absolutePath), { recursive: true });
    writeFileSync(absolutePath, source, 'utf8');
  }
});
