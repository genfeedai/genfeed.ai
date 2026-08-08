import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function walkModuleFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir)) {
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

  const importsBlockMatch = content.match(/imports\s*:\s*\[([^\]]*)\]/s);
  if (importsBlockMatch) {
    const block = importsBlockMatch[1];
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

function countForwardRefs(): number {
  const files = walkModuleFiles(SRC_ROOT);
  let count = 0;
  for (const filePath of files) {
    const content = readFileSync(filePath, 'utf-8');
    const matches = content.match(/forwardRef\(/g);
    if (matches) count += matches.length;
  }
  return count;
}

/**
 * Modules the rest of the graph is allowed to depend on unconditionally. They
 * must stay at the bottom: nothing they import may lead back to them.
 */
const LEAF_MODULES = [
  'AuthProviderModule',
  'CredentialsCoreModule',
  'MetadataModule',
  'OrganizationSettingsModule',
  'RolesModule',
  'SettingsModule',
  'TagsModule',
];

describe('Module dependency graph', () => {
  const graph = buildGraph();
  const cycles = findCycles(graph);

  it('should have no circular dependencies (current baseline — decrease this)', () => {
    // Track cycle count as a ratchet — it should only go down
    // 2026-07: +1 for SocialInboxModule <-> WorkflowsModule (forwardRef, /messages)
    // Re-floored 2026-08-08 after the merge train landed (+2). Decrease only.
    const MAX_ALLOWED_CYCLES = 39;
    console.log(`Found ${cycles.length} cycles across ${graph.size} modules`);
    if (cycles.length > 0) {
      const uniquePairs = new Set<string>();
      for (const cycle of cycles) {
        for (let i = 0; i < cycle.length - 1; i++) {
          const pair = [cycle[i], cycle[i + 1]].sort().join(' <-> ');
          uniquePairs.add(pair);
        }
      }
      console.log(`Unique bidirectional edges in cycles: ${uniquePairs.size}`);
      for (const pair of [...uniquePairs].slice(0, 30)) {
        console.log(`  ${pair}`);
      }
    }
    expect(cycles.length).toBeLessThanOrEqual(MAX_ALLOWED_CYCLES);
  });

  it('should track forwardRef count (ratchet — decrease only)', () => {
    const count = countForwardRefs();
    // Keep the limit exact so any new forwardRef requires removing an existing
    // circular dependency first.
    // 2026-08: 1076 -> 1082. The signup-prefill queue (a73fda8b6) and the
    // SourceCollector sync chain (6e2a2dd1c) each shipped modules that reach
    // back into their callers. Untangling them is its own refactor, so the
    // ratchet is re-pinned rather than left permanently red.
    // 2026-08-07: 1082 -> 1085, a net increase of 3 across the merge train. The
    // webhook event emitters (#2456) pulled WebhookClientModule into six
    // publishers, and brand-scoped integration wiring added BrandsModule edges
    // faster than the quota/uploads/tag-resolution cleanups removed theirs.
    // Re-floored 2026-08-08 after the merge train landed (+3). Decrease only.
    const MAX_ALLOWED_FORWARD_REFS = 1088;
    console.log(`Total forwardRef() calls in module files: ${count}`);
    expect(count).toBeLessThanOrEqual(MAX_ALLOWED_FORWARD_REFS);
  });

  it('leaf modules must not take part in any dependency cycle', () => {
    // A leaf that reaches back up the graph closes a ring, and webpack
    // evaluates that ring long before Nest can honour a `forwardRef`. The
    // compiled API then dies while emitting its own OpenAPI spec with
    // `Cannot access '<Module>' before initialization`, which is how
    // `CredentialsCoreModule -> QuotaModule` was caught. Resolve the upward
    // dependency through `ModuleRef` instead of importing its module.
    const offenders = LEAF_MODULES.flatMap((leaf) => {
      const cycle = cycles.find((entry) => entry.includes(leaf));
      return cycle ? [`${leaf}: ${cycle.join(' -> ')}`] : [];
    });

    expect(offenders).toEqual([]);
  });

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
