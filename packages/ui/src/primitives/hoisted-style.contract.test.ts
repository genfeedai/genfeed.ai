import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = join(__dirname, '../../../..');
const SCANNED_ROOTS = ['packages', 'apps/app'];
const SKIPPED_DIRECTORIES = new Set([
  '.next',
  'coverage',
  'dist',
  'node_modules',
]);

function collectComponentFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIPPED_DIRECTORIES.has(entry.name)) {
      continue;
    }

    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      collectComponentFiles(path, out);
    } else if (
      /\.(?:tsx|jsx)$/.test(entry.name) &&
      !/\.(?:test|spec)\.(?:tsx|jsx)$/.test(entry.name)
    ) {
      out.push(path);
    }
  }

  return out;
}

/** JSX `<style …>` opening tags that React renders in place (no `precedence`). */
function findInPlaceStyleTags(source: string): string[] {
  const code = source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
  const openingTags = code.match(/<style(?=[\s>])[^>]*>/g) ?? [];
  return openingTags.filter((tag) => !/\bprecedence=/.test(tag));
}

describe('hoisted component styles', () => {
  it('never renders an in-place <style> that a browser extension can split during hydration', () => {
    // Dark Reader inserts `<style class="darkreader--sync">` after every
    // <style> it manages before React hydrates. An in-place <style> in
    // server-rendered markup therefore fails hydration (#6601); a React 19
    // hoisted style (`href` + `precedence`) renders in <head> instead.
    const offenders = SCANNED_ROOTS.flatMap((root) =>
      collectComponentFiles(join(REPO_ROOT, root)),
    )
      .filter((file) => findInPlaceStyleTags(readFileSync(file, 'utf8')).length)
      .map((file) => relative(REPO_ROOT, file));

    expect(offenders).toEqual([]);
  });
});
