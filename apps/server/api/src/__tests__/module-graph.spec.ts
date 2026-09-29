import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function walkModuleFiles(dir: string): string[] {
  const results: string[] = [];
  // Filesystem iteration order differs between runner images and local hosts.
  // The DFS below uses insertion order, so keep graph construction stable or
  // the same source tree can report a different number of discovered cycles.
  for (const entry of readdirSync(dir).sort()) {
    const full = join(dir, entry);
    if (entry === 'node_modules' || entry === 'dist') continue;
    if (statSync(full).isDirectory()) {
      results.push(...walkModuleFiles(full));
    } else if (entry.endsWith('.module.ts')) {
      results.push(full);
    }
  }
  return results;
}

interface ModuleNode {
  filePath: string;
  name: string;
  imports: string[];
}

function extractModuleName(filePath: string): string {
  const content = readFileSync(filePath, 'utf-8');
  const classMatch = content.match(/export class (\w+Module)/);
  if (classMatch) return classMatch[1];
  const constMatch = content.match(/export const (\w+Module)\s*=/);
  if (constMatch) return constMatch[1];
  return relative(SRC_ROOT, filePath);
}

function extractImportedModules(filePath: string): string[] {
  const content = readFileSync(filePath, 'utf-8');
  const imports: string[] = [];

  const forwardRefPattern = /forwardRef\(\(\)\s*=>\s*(\w+)\)/g;
  let match: RegExpExecArray | null = forwardRefPattern.exec(content);
  while (match !== null) {
    imports.push(match[1]);
    match = forwardRefPattern.exec(content);
  }

  const importsBlockPattern =
    /\b(?:additionalImports|imports)\s*:\s*\[([^\]]*)\]/gs;
  for (const importsBlockMatch of content.matchAll(importsBlockPattern)) {
    const block = importsBlockMatch[1] ?? '';
    const directModulePattern = /(?<!\w)([A-Z]\w*Module)(?!\s*\))/g;
    let directMatch: RegExpExecArray | null = directModulePattern.exec(block);
    while (directMatch !== null) {
      const name = directMatch[1];
      if (!name.startsWith('forwardRef') && !imports.includes(name)) {
        imports.push(name);
      }
      directMatch = directModulePattern.exec(block);
    }
  }

  return imports;
}

function buildGraph(): Map<string, ModuleNode> {
  const files = walkModuleFiles(SRC_ROOT);
  const graph = new Map<string, ModuleNode>();

  for (const filePath of files) {
    const name = extractModuleName(filePath);
    const imports = extractImportedModules(filePath);
    graph.set(name, { filePath, imports, name });
  }

  return graph;
}

function findCycles(graph: Map<string, ModuleNode>): string[][] {
  const cycles: string[][] = [];
  const visited = new Set<string>();
  const inStack = new Set<string>();
  const stack: string[] = [];

  function dfs(node: string) {
    if (inStack.has(node)) {
      const cycleStart = stack.indexOf(node);
      cycles.push([...stack.slice(cycleStart), node]);
      return;
    }
    if (visited.has(node)) return;

    visited.add(node);
    inStack.add(node);
    stack.push(node);

    const entry = graph.get(node);
    if (entry) {
      for (const dep of entry.imports) {
        if (graph.has(dep)) {
          dfs(dep);
        }
      }
    }

    stack.pop();
    inStack.delete(node);
  }

  for (const name of graph.keys()) {
    dfs(name);
  }

  return cycles;
}

/**
 * Modules the rest of the graph is allowed to depend on unconditionally. They
 * must stay at the bottom: nothing they import may lead back to them.
 */
const LEAF_MODULES = [
  'AuthProviderModule',
  'BotCallbackModule',
  'CredentialsCoreModule',
  'MetadataModule',
  'OrganizationSettingsModule',
  'RolesModule',
  'SettingsModule',
  'TagsModule',
  'VideoStitchModule',
  'WebhooksMediaModule',
];

describe('Module dependency graph', () => {
  const graph = buildGraph();
  const cycles = findCycles(graph);

  it('leaf modules should not be wrapped in forwardRef by callers', () => {
    const violations: string[] = [];
    for (const [name, node] of graph) {
      const content = readFileSync(node.filePath, 'utf-8');
      for (const leaf of LEAF_MODULES) {
        const pattern = new RegExp(`forwardRef\\(\\(\\)\\s*=>\\s*${leaf}\\)`);
        if (pattern.test(content)) {
          violations.push(`${name} uses forwardRef for leaf module ${leaf}`);
        }
      }
    }

    if (violations.length > 0) {
      console.log('Unnecessary forwardRef on leaf modules:');
      for (const v of violations) {
        console.log(`  ${v}`);
      }
    }
    // Start as a warning, tighten to 0 after Phase 1
    const MAX_LEAF_VIOLATIONS = 115;
    expect(violations.length).toBeLessThanOrEqual(MAX_LEAF_VIOLATIONS);
  });
});
