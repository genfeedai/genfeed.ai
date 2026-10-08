import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  assertMcpReferences,
  checkReferenceSources,
  runCheckMcpToolReferences,
} from './check-mcp-tool-references';

let root = '';
let catalog = '';
const source = (text: string) => [{ path: 'fixture/SKILL.md', text }];
function writeCatalog(surface = 'mcp') {
  writeFileSync(
    catalog,
    `export const CURATED_ACTION_CATALOG = [\n  { name: 'get_brands', surfaces: ['${surface}'] },\n  { name: 'rate_content', surfaces: ['agent'] },\n] as const;\n`,
  );
}
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'mcp-references-'));
  catalog = join(root, 'catalog.ts');
  writeCatalog();
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('literal MCP instruction contract', () => {
  it('accepts available tools and excludes schema keys, IDs and unrelated examples', () => {
    expect(
      checkReferenceSources(
        catalog,
        source(
          [
            'Call `get_brands` with the parameter `brand_id`.',
            'Use `mcp__genfeed__get_brands`.',
            '| `user_confirmed` | Manual-phone use |',
            'Node IDs: Use sequential format like `node_1`, `node_2`.',
            'Use `image` for the media type.',
            'Call `get_brands` on the `genfeed` MCP server.',
            '```json',
            '{ "name": "schema_example", "brand_id": "fixture" }',
            '```',
            'Genfeed call:',
            '```json',
            '{ "server": "genfeed", "tool":',
            '  "get_brands", "arguments": { "name": "brand_name", "brand_id": "fixture" } }',
            '```',
          ].join('\n'),
        ),
      ),
    ).toEqual([]);
  });
  it.each([
    'rate_content',
    'removed_action',
    'get_brannds',
    'generete',
    'get__brands',
    'mcp__genfeed__get__brands',
    'mcp__genfeed__get_brannds',
  ])('fails for unsupported %s instead of intersecting known names', (name) => {
    expect(
      checkReferenceSources(catalog, source(`Call the \`${name}\` tool.`)),
    ).toEqual([
      expect.objectContaining({
        line: 1,
        name: name.replace('mcp__genfeed__', ''),
      }),
    ]);
  });
  it('rejects unknown tool-table rows while excluding parameter and provenance tables', () => {
    const text = [
      '| Tool | Description | Required Params |',
      '| --- | --- | --- |',
      '| `missing_action` | Generate content | `brand_id` |',
      '| `generete` | Generate media | `brand_id` |',
      '',
      '| Parameter | Description |',
      '| --- | --- |',
      '| `brand_id` | Input field |',
      '',
      '| Provenance | Meaning |',
      '| --- | --- |',
      '| `user_confirmed` | Manual user confirmation |',
    ].join('\n');
    expect(checkReferenceSources(catalog, source(text))).toEqual([
      {
        path: 'fixture/SKILL.md',
        line: 3,
        name: 'missing_action',
        surface: 'missing',
      },
      {
        path: 'fixture/SKILL.md',
        line: 4,
        name: 'generete',
        surface: 'missing',
      },
    ]);
  });
  it('recognizes single-word curated and namespaced tools', () => {
    writeFileSync(
      catalog,
      "export const CURATED_ACTION_CATALOG = [\n  { name: 'generate', surfaces: ['agent'] },\n] as const;\n",
    );
    expect(
      checkReferenceSources(
        catalog,
        source('Use `generate`.\nmcp__genfeed__generate'),
      ),
    ).toEqual([
      expect.objectContaining({ line: 1, name: 'generate', surface: 'agent' }),
      expect.objectContaining({ line: 2, name: 'generate', surface: 'agent' }),
    ]);
  });
  it('reports multiline call fields at their original line', () => {
    expect(
      checkReferenceSources(
        catalog,
        source(
          'Genfeed call:\n```json\n{ "server": "genfeed",\n "tool_name":\n "missing_action" }\n```',
        ),
      ),
    ).toEqual([
      {
        path: 'fixture/SKILL.md',
        line: 4,
        name: 'missing_action',
        surface: 'missing',
      },
    ]);
  });
  it('fails when a referenced tool loses its MCP surface', () => {
    writeCatalog('agent');
    expect(() =>
      assertMcpReferences(catalog, source('Call `get_brands`.')),
    ).toThrow('unsupported surface (agent)');
  });
  it.each([
    '',
    'export const CURATED_ACTION_CATALOG = [\n] as const;',
    'malformed source',
  ])('fails closed for empty or malformed catalog', (text) => {
    writeFileSync(catalog, text);
    expect(() =>
      checkReferenceSources(catalog, source('Call `get_brands`.')),
    ).toThrow();
  });
  it('scans both default instruction surfaces and disables each independently', () => {
    execFileSync('git', ['init', root]);
    mkdirSync(join(root, 'skills'));
    writeFileSync(join(root, 'skills', 'SKILL.md'), 'Call `rate_content`.');
    execFileSync('git', ['-C', root, 'add', 'skills']);
    mkdirSync(join(root, 'apps/desktop/app'), { recursive: true });
    writeFileSync(join(root, 'apps/desktop/app/tsconfig.json'), '{}');
    mkdirSync(join(root, 'scripts/architecture'), { recursive: true });
    writeFileSync(
      join(root, 'scripts/architecture/desktop-mcp-prompt-adapter.ts'),
      "console.log(JSON.stringify([{ path: 'desktop-prompt', text: 'Call `missing_action`.' }]));",
    );
    const options = { repoRoot: root, catalogPath: catalog };
    expect(runCheckMcpToolReferences(options).map((item) => item.name)).toEqual(
      ['rate_content', 'missing_action'],
    );
    expect(
      runCheckMcpToolReferences({ ...options, noLocalSkills: true }).map(
        (item) => item.name,
      ),
    ).toEqual(['missing_action']);
    expect(
      runCheckMcpToolReferences({ ...options, noDesktop: true }).map(
        (item) => item.name,
      ),
    ).toEqual(['rate_content']);
  });
  it('checks every shipped Markdown surface in an explicit source checkout', () => {
    const skills = join(root, 'public-skills');
    mkdirSync(skills);
    execFileSync('git', ['init', skills]);
    for (const file of [
      'README.md',
      'blog/SKILL.md',
      'blog/references/example.md',
      'plugins/genfeed/README.md',
      'plugins/genfeed/skills/blog/SKILL.md',
      'bundles/blog/SKILL.md',
    ]) {
      mkdirSync(join(skills, file, '..'), { recursive: true });
      writeFileSync(join(skills, file), 'Call `missing_action`.');
    }
    mkdirSync(join(skills, 'fixtures'));
    writeFileSync(
      join(skills, 'fixtures', 'ignored.md'),
      'Call `ignored_action`.',
    );
    execFileSync('git', ['-C', skills, 'add', '.']);
    const result = runCheckMcpToolReferences({
      repoRoot: root,
      catalogPath: catalog,
      skillsDir: skills,
      noLocalSkills: true,
      noDesktop: true,
    });
    expect(result).toHaveLength(6);
    expect(result.every((item) => item.name === 'missing_action')).toBe(true);
  });
  it('checks the real rendered desktop prompt and named constant', () => {
    writeFileSync(
      catalog,
      "export const CURATED_ACTION_CATALOG = [\n  { name: 'get_brand_context', surfaces: ['agent'] },\n] as const;\n",
    );
    const result = runCheckMcpToolReferences({
      repoRoot: resolve(import.meta.dirname, '../..'),
      catalogPath: catalog,
      noLocalSkills: true,
    });
    expect(result.length).toBeGreaterThan(0);
    expect(
      result.every(
        (item) =>
          item.path.endsWith('cli-agent-runtime.constants.ts') &&
          item.name === 'get_brand_context',
      ),
    ).toBe(true);
  });
  it('rejects an empty or nested explicitly requested public checkout', () => {
    const skills = join(root, 'empty');
    mkdirSync(skills);
    execFileSync('git', ['init', skills]);
    const options = {
      repoRoot: root,
      catalogPath: catalog,
      skillsDir: skills,
      noLocalSkills: true,
      noDesktop: true,
    };
    expect(() => runCheckMcpToolReferences(options)).toThrow(
      'Empty instruction source',
    );
    mkdirSync(join(skills, 'nested'));
    expect(() =>
      runCheckMcpToolReferences({
        ...options,
        skillsDir: join(skills, 'nested'),
      }),
    ).toThrow('must be the repository root');
  });
  it('rejects a request selecting no instruction surfaces', () => {
    expect(() =>
      runCheckMcpToolReferences({
        repoRoot: root,
        catalogPath: catalog,
        noLocalSkills: true,
        noDesktop: true,
      }),
    ).toThrow('No instruction surface selected');
  });
  it('fails closed for explicitly requested missing checkout and local skills root', () => {
    expect(() =>
      runCheckMcpToolReferences({
        repoRoot: root,
        catalogPath: catalog,
        skillsDir: join(root, 'missing'),
        noLocalSkills: true,
        noDesktop: true,
      }),
    ).toThrow('source directory is missing');
    expect(() =>
      runCheckMcpToolReferences({ repoRoot: root, catalogPath: catalog }),
    ).toThrow('source directory is missing');
  });
});
