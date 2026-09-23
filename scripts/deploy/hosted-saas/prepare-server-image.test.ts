import { describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { prepareServerImage, verifyBundle } from './prepare-server-image';

const source = 'ghcr.io/example/server';
const destination = '123456789012.dkr.ecr.eu-west-1.amazonaws.com/server';
const base = `sha256:${'a'.repeat(64)}`;
const overlay = `sha256:${'b'.repeat(64)}`;
const contents = Buffer.from(
  'exports.CONTENT_HARNESS_PACK = { id: "test", version: "1", applies: () => true, contribute: () => ({}) };',
);
const bundleSha256 = createHash('sha256').update(contents).digest('hex');
const bundleUri = 's3://test-bucket/immutable.cjs';
const config = { source, destination, tag: 'abc123' };

describe('hosted content harness image', () => {
  test('keeps the exact public digest when no bundle is configured', () => {
    const commands: string[][] = [];
    const result = prepareServerImage(config, (command, args) => {
      commands.push([command, ...args]);
      return args.includes('inspect') ? JSON.stringify(base) : '';
    });
    expect(result).toEqual({ digest: base, packages: '' });
    expect(commands).toHaveLength(3);
    expect(commands[1]).toContain(`${source}@${base}`);
    expect(commands.flat()).not.toContain('build');
  });

  test('rejects incomplete config and public output before any network command', () => {
    const execute = () => {
      throw new Error('must not run');
    };
    expect(() => prepareServerImage({ ...config, bundleUri }, execute)).toThrow(
      'Configure both',
    );
    expect(() =>
      prepareServerImage({ ...config, bundleSha256 }, execute),
    ).toThrow('Configure both');
    expect(() =>
      prepareServerImage(
        { ...config, destination: 'ghcr.io/example/private' },
        execute,
      ),
    ).toThrow('private ECR');
    expect(() =>
      prepareServerImage({ ...config, tag: 'foo; echo bad' }, execute),
    ).toThrow('Invalid source');
  });

  test('rejects altered, empty and oversized bundles', () => {
    expect(() => verifyBundle(contents, 'f'.repeat(64))).toThrow('checksum');
    expect(() => verifyBundle(Buffer.alloc(0), bundleSha256)).toThrow('size');
    expect(() =>
      verifyBundle(Buffer.alloc(5 * 1024 * 1024 + 1), bundleSha256),
    ).toThrow('size');
  });

  test('builds only a private overlay and cleans private contents after success', () => {
    let directory = '';
    let built = false;
    const result = prepareServerImage(
      { ...config, bundleUri, bundleSha256 },
      (command, args) => {
        if (command === 'aws') {
          directory = dirname(args[3]);
          writeFileSync(args[3], contents);
          return '';
        }
        if (args[1] === 'build') {
          built = true;
          const dockerfile = readFileSync(
            join(directory, 'Dockerfile'),
            'utf8',
          );
          expect(dockerfile).toContain(`FROM ${source}@${base}`);
          expect(dockerfile).toContain('COPY --chmod=0444 index.cjs');
          expect(args).toContain('--no-cache');
          expect(args).not.toContain('--cache-to');
          expect(args[args.indexOf('-t') + 1]).toStartWith(
            `${destination}:harness-`,
          );
          return '';
        }
        return JSON.stringify(built ? overlay : base);
      },
    );
    expect(result).toEqual({
      digest: overlay,
      packages: '/usr/src/app/content-harness/index.cjs',
    });
    expect(existsSync(directory)).toBe(false);
  });

  test('never builds corrupt content and cleans it after validation failure', () => {
    let directory = '';
    expect(() =>
      prepareServerImage(
        { ...config, bundleUri, bundleSha256 },
        (command, args) => {
          if (command === 'aws') {
            directory = dirname(args[3]);
            writeFileSync(args[3], 'corrupt');
            return '';
          }
          if (args[1] === 'build') throw new Error('must not build');
          return JSON.stringify(base);
        },
      ),
    ).toThrow('checksum');
    expect(existsSync(directory)).toBe(false);
  });

  test('refuses an image copy whose digest changed', () => {
    let inspected = false;
    expect(() =>
      prepareServerImage(config, (_command, args) => {
        if (!args.includes('inspect')) return '';
        const value = inspected ? overlay : base;
        inspected = true;
        return JSON.stringify(value);
      }),
    ).toThrow('does not match');
  });
});
