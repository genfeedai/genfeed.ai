import path from 'node:path';
import { build } from 'esbuild';
import { describe, expect, it } from 'vitest';
import * as browserActions from './index';

const root = path.resolve(import.meta.dirname, '..');

describe('actions browser boundary', () => {
  it('keeps Node-only hashing out of the public runtime exports', () => {
    expect(browserActions).not.toHaveProperty('buildLogicalWriteKey');
    expect(browserActions.getActionDefinition('create_post')).toBeDefined();
    expect(browserActions.evaluateMutationPolicy).toBeTypeOf('function');
  });

  it('bundles the complete public graph for browsers without builtin shims', async () => {
    const result = await build({
      absWorkingDir: root,
      bundle: true,
      entryPoints: ['./src/index.ts'],
      format: 'esm',
      logLevel: 'silent',
      metafile: true,
      platform: 'browser',
      treeShaking: false,
      write: false,
    });

    expect(result.errors).toEqual([]);
    expect(result.metafile).toBeDefined();
    expect(Object.keys(result.metafile?.inputs ?? {})).not.toContain(
      'src/server/logical-write-key.ts',
    );
    expect(result.outputFiles[0]?.text).not.toContain('node:crypto');
  });
});
