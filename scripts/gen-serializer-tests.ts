/**
 * Generate tests for serializer attributes and configs
 */
import fs from 'node:fs';
import path from 'node:path';

const srcDir = path.resolve(__dirname, '../packages/serializers/src');
const testDir = path.resolve(__dirname, '../packages/serializers/__tests__');

fs.mkdirSync(testDir, { recursive: true });

// --- Generate attribute tests ---
function findTsFiles(dir: string, base: string = ''): string[] {
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = path.join(base, entry.name);
    if (entry.isDirectory()) {
      results.push(...findTsFiles(path.join(dir, entry.name), rel));
    } else if (entry.name.endsWith('.ts') && entry.name !== 'index.ts') {
      results.push(rel);
    }
  }
  return results;
}

// Attribute tests
const attrFiles = findTsFiles(path.join(srcDir, 'attributes'));
let attrTestContent = `import { describe, expect, it } from 'vitest';\n`;
const attrImports: string[] = [];
const attrTests: string[] = [];

for (const file of attrFiles) {
  const content = fs.readFileSync(
    path.join(srcDir, 'attributes', file),
    'utf-8',
  );
  const exportRegex = /export\s+const\s+(\w+)\s*=/g;
  let match;
  while ((match = exportRegex.exec(content)) !== null) {
    const name = match[1];
    const importPath = `../src/attributes/${file.replace('.ts', '')}`;
    attrImports.push(`import { ${name} } from '${importPath}';`);
    const category = file.split('/')[0];
    attrTests.push(`
  describe('${name}', () => {
    it('should be a non-empty array of strings', () => {
      expect(Array.isArray(${name})).toBe(true);
      expect(${name}.length).toBeGreaterThan(0);
      for (const attr of ${name}) {
        expect(typeof attr).toBe('string');
      }
    });

    it('should not contain duplicates', () => {
      const unique = new Set(${name});
      expect(unique.size).toBe(${name}.length);
    });
  });`);
  }
}

attrTestContent += attrImports.join('\n') + '\n\n';
attrTestContent += `describe('Serializer Attributes', () => {\n${attrTests.join('\n')}\n});\n`;
fs.writeFileSync(path.join(testDir, 'attributes.test.ts'), attrTestContent);

// Config tests
const configFiles = findTsFiles(path.join(srcDir, 'configs'));
let configTestContent = `import { describe, expect, it } from 'vitest';\n`;
const configImports: string[] = [];
const configTests: string[] = [];

for (const file of configFiles) {
  const content = fs.readFileSync(path.join(srcDir, 'configs', file), 'utf-8');
  const exportRegex = /export\s+const\s+(\w+)\s*(?::\s*\w+\s*)?=/g;
  let match;
  while ((match = exportRegex.exec(content)) !== null) {
    const name = match[1];
    const importPath = `../src/configs/${file.replace('.ts', '')}`;
    configImports.push(`import { ${name} } from '${importPath}';`);
    configTests.push(`
  describe('${name}', () => {
    it('should have a type string', () => {
      expect(typeof ${name}.type).toBe('string');
      expect(${name}.type.length).toBeGreaterThan(0);
    });

    it('should have attributes array', () => {
      expect(Array.isArray(${name}.attributes)).toBe(true);
      expect(${name}.attributes.length).toBeGreaterThan(0);
    });

    it('should have string attributes', () => {
      for (const attr of ${name}.attributes) {
        expect(typeof attr).toBe('string');
      }
    });

    it('relationships should have correct structure', () => {
      const keys = Object.keys(${name}).filter(k => k !== 'type' && k !== 'attributes');
      for (const key of keys) {
        const rel = (${name} as any)[key];
        if (rel && typeof rel === 'object' && 'type' in rel) {
          expect(typeof rel.type).toBe('string');
          expect(rel.ref).toBe('_id');
          expect(Array.isArray(rel.attributes)).toBe(true);
        }
      }
    });
  });`);
  }
}

configTestContent += configImports.join('\n') + '\n\n';
configTestContent += `describe('Serializer Configs', () => {\n${configTests.join('\n')}\n});\n`;
fs.writeFileSync(path.join(testDir, 'all-configs.test.ts'), configTestContent);

// Server serializer tests
const serverFiles = findTsFiles(path.join(srcDir, 'server'));
let serverTestContent = `import { describe, expect, it } from 'vitest';\n`;
const serverImports: string[] = [];
const serverTests: string[] = [];

for (const file of serverFiles) {
  const content = fs.readFileSync(path.join(srcDir, 'server', file), 'utf-8');
  // Match: export const { FooSerializer } = buildSerializer(...)
  const exportRegex = /export\s+const\s*\{\s*(\w+)\s*\}/g;
  let match;
  while ((match = exportRegex.exec(content)) !== null) {
    const name = match[1];
    const importPath = `../src/server/${file.replace('.ts', '')}`;
    serverImports.push(`import { ${name} } from '${importPath}';`);
    serverTests.push(`
  describe('${name}', () => {
    it('should be a function (serializer)', () => {
      expect(typeof ${name}).toBe('object');
    });

    it('should have a serialize method', () => {
      expect(typeof ${name}.serialize).toBe('function');
    });
  });`);
  }
}

serverTestContent += serverImports.join('\n') + '\n\n';
serverTestContent += `describe('Server Serializers', () => {\n${serverTests.join('\n')}\n});\n`;
fs.writeFileSync(
  path.join(testDir, 'server-serializers.test.ts'),
  serverTestContent,
);

console.log(
  `Generated: attributes.test.ts (${attrTests.length} suites), all-configs.test.ts (${configTests.length} suites), server-serializers.test.ts (${serverTests.length} suites)`,
);
