/**
 * Rewrite `forwardRef(() => FooModule)` to `FooModule` when Foo cannot reach
 * the current module. Those wrappers do not break a cycle; they only hide
 * the real graph. Cyclic edges are left alone.
 *
 * Usage: bun scripts/architecture/strip-one-way-forwardrefs.ts
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const SRC_ROOT = join(import.meta.dir, '../../apps/server/api/src');

function walkModuleFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir).sort()) {
    const full = join(dir, entry);
    if (entry === 'node_modules' || entry === 'dist') continue;
    if (statSync(full).isDirectory()) {
      results.push(...walkModuleFiles(full));
    } else if (entry.endsWith('.module.ts') && !entry.endsWith('.spec.ts')) {
      results.push(full);
    }
  }
  return results;
}

function extractModuleName(filePath: string, content: string): string {
  return (
    content.match(/export class (\w+Module)/)?.[1] ??
    content.match(/export const (\w+Module)\s*=/)?.[1] ??
    relative(SRC_ROOT, filePath)
  );
}

function extractImportedModules(content: string): string[] {
  const imports: string[] = [];
  for (const match of content.matchAll(/forwardRef\(\(\)\s*=>\s*(\w+)\)/g)) {
    imports.push(match[1]);
  }
  const block = content.match(/imports\s*:\s*\[([^\]]*)\]/s)?.[1] ?? '';
  for (const match of block.matchAll(/(?<!\w)([A-Z]\w*Module)(?!\s*\))/g)) {
    if (!match[1].startsWith('forwardRef') && !imports.includes(match[1])) {
      imports.push(match[1]);
    }
  }
  return imports;
}

const files = walkModuleFiles(SRC_ROOT);
const nodes = new Map<string, { filePath: string; imports: string[] }>();
const contents = new Map<string, string>();

for (const filePath of files) {
  const content = readFileSync(filePath, 'utf8');
  contents.set(filePath, content);
  const name = extractModuleName(filePath, content);
  nodes.set(name, {
    filePath,
    imports: extractImportedModules(content),
  });
}

function canReach(from: string, target: string): boolean {
  const seen = new Set<string>();
  const stack = [from];
  while (stack.length > 0) {
    const node = stack.pop();
    if (node === undefined) break;
    if (node === target) return true;
    if (seen.has(node)) continue;
    seen.add(node);
    for (const dep of nodes.get(node)?.imports ?? []) {
      if (nodes.has(dep)) stack.push(dep);
    }
  }
  return false;
}

let rewritten = 0;
let filesTouched = 0;

for (const [name, node] of nodes) {
  let next = contents.get(node.filePath);
  if (next === undefined) continue;
  const original = next;

  next = next.replace(
    /forwardRef\(\(\)\s*=>\s*(\w+)\)/g,
    (full, target: string) => {
      if (canReach(target, name)) {
        return full;
      }
      rewritten += 1;
      return target;
    },
  );

  if (next === original) continue;

  if (!next.includes('forwardRef(')) {
    next = next
      .replace(
        /import \{([^}]+)\} from '@nestjs\/common';/g,
        (_full, inner: string) => {
          const names = inner
            .split(',')
            .map((part: string) => part.trim())
            .filter((part: string) => part && part !== 'forwardRef');
          if (names.length === 0) {
            return '';
          }
          return `import { ${names.join(', ')} } from '@nestjs/common';`;
        },
      )
      .replace(/\n{3,}/g, '\n\n');
  }

  writeFileSync(node.filePath, next);
  filesTouched += 1;
}

process.stdout.write(
  `stripped ${rewritten} one-way forwardRef(s) across ${filesTouched} module file(s)\n`,
);
